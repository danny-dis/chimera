import type { Complexity, Evidence, EvidenceBundle, Checkpoint, AgentId, RunId } from '@chimera/domain';
import { AgentMesh } from '../agent-mesh.js';
import { EventStream } from '../event-stream.js';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute, sep } from 'node:path';
import { EvidenceCollector } from './evidence-collector.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { Mode } from '../types/agent.js';
import { SecretDetector } from '../security/secret-detector.js';
import { SecurityManager } from './security-manager.js';
import { checkToolOutput, sanitizeForPrompt } from '../security/prompt-guard.js';
import { verificationInputsUnchanged, type VerificationInputs } from './verification-inputs.js';

export interface CommandVerification {
  verified: boolean;
  reason?: string;
  bundle: EvidenceBundle;
}

function workspaceFingerprint(root: string, generatedOutputs: string[] = [], inputs?: Set<string>): { digest: string; paths: Set<string> } {
  const hash = createHash('sha256');
  const paths = new Set<string>();
  const outputs = generatedOutputs.map(output => {
    const path = resolve(root, output);
    const fromRoot = relative(resolve(root), path);
    if (!output.trim() || !fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error('Generated output paths must be strictly inside the workspace');
    }
    return path;
  });
  const isOutput = (file: string): boolean => outputs.some(output => {
    const within = relative(output, resolve(file));
    return !within || (!within.startsWith('..') && !isAbsolute(within));
  });
  // ponytail: conservative whole-workspace scan; scope to declared inputs if large repos need it.
  const visit = (dir: string): void => {

    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules', '.chimera'].includes(entry.name)) continue;
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Cannot verify symlinked workspace inputs');
      if (inputs && !inputs.has(file) && isOutput(file)) continue;
      paths.add(file);
      hash.update(JSON.stringify(file));
      if (entry.isDirectory()) visit(file);
      else hash.update(createHash('sha256').update(readFileSync(file)).digest());
    }
  };
  visit(root);
  return { digest: hash.digest('hex'), paths };
}

export interface VerificationRequest {
  task: string;
  agentOutputs: Array<{
    agentId: AgentId;
    role: string;
    output: string;
    patch?: string;
    testResults?: Record<string, unknown>;
  }>;
  options?: {
    parallel?: boolean;
    reviewerModel?: string;
    challengerModel?: string;
  };
}

/**
 * VerificationController — evidence and verification pipeline.
 * Wraps AgentMesh's quality gate and adds evidence bundling.
 */
export class VerificationController {
  private agentMesh: AgentMesh;
  private eventStream: EventStream;

  constructor(eventStreamOrMesh?: EventStream | AgentMesh) {
    if (eventStreamOrMesh instanceof AgentMesh) {
      this.agentMesh = eventStreamOrMesh;
      this.eventStream = eventStreamOrMesh.getEventStream();
    } else {
      this.eventStream = eventStreamOrMesh ?? new EventStream();
      this.agentMesh = new AgentMesh(this.eventStream);
    }
  }

  async runCommandChecks(request: {
    runId: RunId;
    commands: string[];
    /** Caller-declared generated outputs, never inferred from directory names. */
    generatedOutputs?: string[];
    verificationInputs?: VerificationInputs;
    executor: ToolExecutorInterface | null;
    registry: ToolRegistryInterface | null;
    workspaceRoot: string;
    mode: Mode;
    signal?: AbortSignal;
  }): Promise<CommandVerification> {
    const collector = new EvidenceCollector();
    const commands = [...request.commands];
    const generatedOutputs = [...(request.generatedOutputs ?? [])];
    const verificationInputs = { ...(request.verificationInputs ?? {}) };
    let reason: string | undefined;
    try {
      if (request.signal?.aborted) throw new Error('Aborted');
      if (!commands.length) throw new Error('No caller-owned verification commands executed');
      if (!verificationInputsUnchanged(request.workspaceRoot, verificationInputs)) throw new Error('Caller-owned verification inputs changed');
      const shell = request.registry?.has('run_shell_command') ? 'run_shell_command' : 'shell';
      if (!request.executor || !request.registry?.has(shell)) throw new Error('Registered shell executor required for verification');
      const before = workspaceFingerprint(request.workspaceRoot, generatedOutputs);
      for (const command of commands) {
        if (typeof command !== 'string' || !command.trim()) throw new Error('Verification commands must be nonempty strings');
        if (request.signal?.aborted) throw new Error('Aborted');
        const result = await request.executor.execute(shell, { command }, {
          workspaceRoot: request.workspaceRoot, sessionId: request.runId,
          eventStream: this.eventStream, mode: request.mode, signal: request.signal,
        });
        const passed = result.success && result.data?.exitCode === 0 && !request.signal?.aborted;
        let diagnostic: string | undefined;
        if (!passed && result.data) {
          let text = [result.data.stderr, result.data.stdout].filter(value => typeof value === 'string').join('\n');
          for (const [key, value] of Object.entries(process.env)) {
            if (value && value.length > 3 && /KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL|AUTH/i.test(key)) text = text.split(value).join('[REDACTED]');
          }
          text = new SecurityManager().redactSecrets(new SecretDetector().redactSecrets(text.slice(0, 8192)));
          const checked = checkToolOutput(text, 'run_shell_command');
          diagnostic = !checked.safe && checked.confidence > 0.8 ? '[Untrusted diagnostic withheld]' : sanitizeForPrompt(text).slice(0, 2048);
        }
        collector.addEvidence({
          runId: request.runId, agentId: 'verification', type: 'test_result',
          verdict: passed ? 'pass' : 'fail', description: command, severity: passed ? 'info' : 'high',
          data: { command, cwd: request.workspaceRoot, exitCode: result.data?.exitCode,
            durationMs: result.duration, fingerprint: before.digest, ...(diagnostic ? { diagnostic } : {}) },
        });
        if (!verificationInputsUnchanged(request.workspaceRoot, verificationInputs)) throw new Error('Caller-owned verification inputs changed');
        if (workspaceFingerprint(request.workspaceRoot, generatedOutputs, before.paths).digest !== before.digest) throw new Error('Verification is stale: workspace changed during checks');
        if (!passed) throw new Error(request.signal?.aborted ? 'Aborted' : 'Verification failed or was denied');
      }
      if (request.signal?.aborted) throw new Error('Aborted');

    } catch (err) {
      // Executor exceptions can include raw output or credentials; retain no arbitrary error text.
      reason = request.signal?.aborted ? 'Aborted' :
        (err instanceof Error && /^(No caller-owned verification commands executed|Registered shell executor required for verification|Verification commands must be nonempty strings|Verification failed or was denied|Verification is stale: workspace changed during checks|Cannot verify symlinked workspace inputs|Generated output paths must be strictly inside the workspace|Caller-owned verification inputs changed)$/.test(err.message)
          ? err.message : 'Verification unavailable');
    }
    const bundle = collector.buildBundle(request.runId);
    const verified = !reason && collector.verifyAllPassed(request.runId);
    this.eventStream.append({ type: 'evidence_bundle_created', runId: request.runId, bundle } as any);
    return { verified, reason, bundle };
  }

  /**
   * Determine if verification should run based on strategy and complexity.
   */
  shouldVerify(strategy: string, complexity: Complexity, task: string): boolean {
    // Always verify trio and above
    if (['trio', 'duo', 'swarm', 'hive'].includes(strategy)) return true;
    // Verify high-complexity tasks
    if (complexity.overall >= 0.6) return true;
    // Don't verify simple solo tasks
    return false;
  }

  /**
   * Run verification and produce evidence bundle.
   */
  async runVerification(
    runId: RunId,
    request: VerificationRequest,
  ): Promise<EvidenceBundle> {
    const evidences: Evidence[] = [];

    // Run quality gate via AgentMesh
    const qualityGateResult = await this.agentMesh.executeQualityGate({
      task: request.task,
      draftAgentId: request.agentOutputs.find((o) => o.role === 'implementer')?.agentId ?? '',
      reviewerAgentId: request.agentOutputs.find((o) => o.role === 'reviewer')?.agentId ?? '',
      draftOutput: request.agentOutputs.find((o) => o.role === 'implementer')?.output,
    });

    // Convert quality gate stages to evidence
    for (const stage of qualityGateResult.stages) {
      evidences.push({
        id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId,
        agentId: stage.agentId as AgentId,
        type: stage.stage === 'verify' ? 'review_finding' : 'provenance',
        verdict: stage.verdict,
        description: `${stage.stage} stage result`,
        severity: stage.verdict === 'pass' ? 'info' : stage.verdict === 'needs_revision' ? 'medium' : 'high',
        data: {
          output: stage.output,
          findings: stage.findings,
          durationMs: stage.durationMs,
        },
        timestamp: Date.now(),
      });
    }

    // Add provenance evidence for each agent output
    for (const output of request.agentOutputs) {
      if (output.role !== 'reviewer' && output.role !== 'challenger') {
        evidences.push({
          id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          runId,
          agentId: output.agentId,
          type: 'provenance',
          verdict: 'pass',
          description: `Output from ${output.role}`,
          severity: 'info',
          data: { output: output.output, patch: output.patch },
          timestamp: Date.now(),
        });
      }
    }

    const bundle: EvidenceBundle = {
      runId,
      evidences,
      summary: {
        total: evidences.length,
        passed: evidences.filter((e) => e.verdict === 'pass').length,
        failed: evidences.filter((e) => e.verdict === 'fail').length,
        needsRevision: evidences.filter((e) => e.verdict === 'needs_revision').length,
      },
      generatedAt: Date.now(),
    };

    this.eventStream.append({
      type: 'evidence_bundle_created',
      runId,
      bundle,
    } as any);

    return bundle;
  }

  /**
   * Finalize a run with verification.
   */
  async finalize(
    runId: RunId,
    bundle: EvidenceBundle,
    targetBefore: { mtime: number; size: number } | null,
  ): Promise<{
    status: 'done' | 'needs_user' | 'error';
    output: string;
    cost: number;
    agentCount: number;
  }> {
    const failedCount = bundle.summary.failed;
    const needsRevisionCount = bundle.summary.needsRevision;

    let status: 'done' | 'needs_user' | 'error' = 'done';
    let output = 'All verification passed.';

    if (failedCount > 0) {
      status = 'needs_user';
      output = `${failedCount} verification(s) failed. Please review.`;
    } else if (needsRevisionCount > 0) {
      status = 'needs_user';
      output = `${needsRevisionCount} verification(s) need revision.`;
    }

    return {
      status,
      output,
      cost: 0,
      agentCount: bundle.evidences.length,
    };
  }

  /**
   * Get the underlying AgentMesh.
   */
  getAgentMesh(): AgentMesh {
    return this.agentMesh;
  }
}
