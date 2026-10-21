/**
 * Eval runner — bridges EvalHarness to the CLI.
 *
 * Phase 0.5 deliverable: takes a task reference (file path, fixture id, or
 * inline JSON), constructs an EvalHarness, records a synthetic trajectory
 * (or a real orchestrator run when one is wired in), and returns an
 * EvalReport. LLM judge integration will land in Phase 1C alongside
 * sideQuery consumers (see DOCS/port-plan.md).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionOrchestrator, EventStream, adaptProvider } from '@chimera/core';
import type { Mode, OrchestratorResult, ToolRegistryInterface, ToolExecutorInterface } from '@chimera/core';
import type { ChimeraEvent } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import { EvalHarness } from '@chimera/eval';
import type { EvalReport, TaskSpec, Trajectory, TrajectoryStep } from '@chimera/eval';
import { createToolContext } from './tool-context.js';


/**
 * Real trajectory recorder — executes a task through the SessionOrchestrator
 * and captures the event stream to build a Trajectory.
 */
export class RealTrajectoryRecorder {
  constructor(
    private providers: { writer: ModelProvider; reviewer: ModelProvider },
    private workspaceRoot: string,
    private toolOptions: Parameters<typeof createToolContext>[1] = {},
  ) {}

  async record(task: TaskSpec, mode: Mode): Promise<Trajectory> {
    for (const field of ['expectedFiles', 'verificationCommands', 'verificationOutputs'] as const) {
      const values = task[field];
      if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`${field} must be an array of nonempty strings`);
    }
    const eventStream = new EventStream();
    const { toolRegistry, toolExecutor } = createToolContext(mode, this.toolOptions);
    const orchestrator = new SessionOrchestrator(
      eventStream,
      { registry: toolRegistry as unknown as ToolRegistryInterface, executor: toolExecutor as unknown as ToolExecutorInterface },
      this.workspaceRoot,
    );

    // Capture all events
    const events: ChimeraEvent[] = [];
    eventStream.subscribe('*', (event) => events.push(event));

    const startTime = Date.now();
    let result: OrchestratorResult;
    try {
      result = await orchestrator.execute({
        task: task.description,
        mode,
        providers: {
          writer: adaptProvider(this.providers.writer),
          reviewer: adaptProvider(this.providers.reviewer),
        },
        verificationCommands: task.verificationCommands,
        verificationOutputs: task.verificationOutputs,
        costCap: task.maxCost,
      });
    } finally { orchestrator.dispose(); }
    const duration = Date.now() - startTime;

    return this.buildTrajectory(task, mode, events, result, duration);
  }

  private buildTrajectory(
    task: TaskSpec,
    mode: Mode,
    events: ChimeraEvent[],
    result: OrchestratorResult,
    duration: number,
  ): Trajectory {
    const steps: TrajectoryStep[] = [];

    for (const event of events) {
      const step = this.eventToStep(event);
      if (step) steps.push(step);
    }
    const files = (task.expectedFiles ?? []).filter(file => {
      try {
        const target = path.resolve(this.workspaceRoot, file);
        const within = path.relative(fs.realpathSync(this.workspaceRoot), fs.realpathSync(target));
        return within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within) && fs.statSync(target).isFile();
      } catch { return false; }
    });
    steps.push({ timestamp: Date.now(), type: 'check', output: { pass: result.status === 'done', verification: result.verification, files }, ...(result.status !== 'done' ? { error: `Run ended ${result.status}` } : {}) });

    // Calculate total tokens from events
    const totalTokens = this.calculateTokens(events);

    return {
      taskId: task.id,
      config: { mode, real: true, synthetic: false, tokensMeasured: false },
      steps,
      finalOutput: result.output,
      totalCost: result.cost,
      totalTokens,
      duration,
    };
  }

  private eventToStep(event: ChimeraEvent): TrajectoryStep | null {
    const timestamp = Date.now();

    switch (event.type) {
      case 'user_request':
        return {
          timestamp,
          type: 'user_request',
          input: { task: event.text, mode: event.mode },
        };
      case 'agent_spawned':
        return {
          timestamp,
          type: 'agent_call',
          agentId: event.agentId,
          role: event.role,
          provider: event.provider,
          model: event.model,
          output: {},
        };
      case 'draft_proposed':
        return {
          timestamp,
          type: 'agent_call',
          agentId: event.agentId,
          output: { confidence: event.confidence },
        };
      case 'tool_call_requested':
        return {
          timestamp,
          type: 'tool_call',
          input: event.call,
        };
      case 'tool_call_result':
        return {
          timestamp,
          type: 'tool_result',
          output: event.result,
        };
      case 'verified':
        return {
          timestamp,
          type: 'check',
          agentId: event.agentId,
          output: { verdict: event.verdict, findings: event.findings },
        };
      case 'challenged':
        return {
          timestamp,
          type: 'check',
          agentId: event.agentId,
          output: { challenges: event.challenges, alternatives: event.alternatives },
        };
      case 'final_response':
        return {
          timestamp,
          type: 'response',
          output: event.output ?? '',
        };
      default:
        return null;
    }
  }

  private calculateTokens(_events: ChimeraEvent[]): { input: number; output: number } {
    // Sum tokens from agent_spawned events (they don't have token counts)
    // For now, return a placeholder; real token tracking would require
    // instrumenting the orchestrator's cost tracker
    return { input: 0, output: 0 };
  }
}

/**
 * Load a TaskSpec from a path, fixture id, or inline JSON.
 *
 * Resolution order:
 *  1. If `taskRef` parses as JSON, treat as inline TaskSpec.
 *  2. If `taskRef` is a path to an existing file, read and parse it (JSON or YAML-ish).
 *  3. Else look in `<fixturesDir>/<taskRef>.json` (or `.yaml`).
 *  4. Else error.
 */
export function loadTaskSpec(taskRef: string, fixturesDir: string): TaskSpec {
  // 1. Inline JSON
  if (taskRef.trimStart().startsWith('{')) {
    try {
      return JSON.parse(taskRef) as TaskSpec;
    } catch (err) {
      throw new Error(`Failed to parse inline TaskSpec JSON: ${(err as Error).message}`);
    }
  }

  // 2. Direct file path
  if (fs.existsSync(taskRef)) {
    return parseTaskFile(taskRef);
  }

  // 3. Fixtures dir
  for (const ext of ['.json', '.yaml', '.yml']) {
    const candidate = path.join(fixturesDir, `${taskRef}${ext}`);
    if (fs.existsSync(candidate)) {
      return parseTaskFile(candidate);
    }
  }

  throw new Error(
    `Could not resolve task "${taskRef}". Pass an inline JSON object, a file path, or a fixture id (looked in ${fixturesDir}).`,
  );
}

function parseTaskFile(filePath: string): TaskSpec {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    // Minimal YAML→JSON for flat key:value with one nesting level.
    const obj: Record<string, unknown> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w_-]+):\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (val.startsWith('[') && val.endsWith(']')) {
          try {
            obj[key] = JSON.parse(val.replace(/'/g, '"'));
          } catch {
            obj[key] = val;
          }
        } else if (val === 'true' || val === 'false') {
          obj[key] = val === 'true';
        } else if (/^-?\d+(\.\d+)?$/.test(val)) {
          obj[key] = Number(val);
        } else {
          obj[key] = val;
        }
      }
    }
    if (!obj.id || !obj.description) {
      throw new Error(`TaskSpec at ${filePath} missing required fields "id" or "description"`);
    }
    return obj as unknown as TaskSpec;
  }
  const parsed = JSON.parse(raw) as TaskSpec;
  if (!parsed.id || !parsed.description) {
    throw new Error(`TaskSpec at ${filePath} missing required fields "id" or "description"`);
  }
  return parsed;
}

/**
 * Build a synthetic trajectory for the eval. A future iteration will replay
 * real orchestrator runs; for now we record a deterministic pass-through so
 * the CLI surface is end-to-end testable.
 */
export function buildSyntheticTrajectory(task: TaskSpec, mode: Mode): Trajectory {
  const now = Date.now();
  const steps: TrajectoryStep[] = [
    {
      timestamp: now,
      type: 'user_request',
      input: { task: task.description, mode },
    },

  ];
  steps.push({
    timestamp: now + 3,
    type: 'check',
    output: { pass: false, reason: 'Synthetic trajectory: no task or checks executed' },
    error: 'Synthetic trajectory: no task or checks executed',
  });
  steps.push({
    timestamp: now + 4,
    type: 'response',
    output: `[SYNTHETIC] ${task.description}`,
  });
  return {
    taskId: task.id,
    config: { mode, real: false, synthetic: true, tokensMeasured: false },
    steps,
    finalOutput: `[SYNTHETIC] ${task.description}`,
    totalCost: 0,
    totalTokens: { input: 0, output: 0 },
    duration: 0,
  };
}

/**
 * End-to-end: load the spec, build a synthetic trajectory, score via the
 * heuristic `EvalHarness.scoreTask`, and return the aggregated report.
 *
 * LLM-judge integration is deferred to Phase 1C (sideQuery consumers).
 */
export async function runEval(
  taskRef: string,
  options: {
    fixturesDir: string;
    mode: Mode;
    real?: boolean;
    providers?: { writer: ModelProvider; reviewer: ModelProvider };
    workspaceRoot?: string;
    toolOptions?: Parameters<typeof createToolContext>[1];
  },
): Promise<EvalReport> {
  const spec = loadTaskSpec(taskRef, options.fixturesDir);
  let trajectory: Trajectory;
  if (options.real && (!options.providers || Object.values(options.providers).some(provider => provider.getModel().provider === 'mock'))) {
    throw new Error('Real evaluation requires actual model providers; offline mock/synthetic runs are not live evidence');
  }

  if (options.real && options.providers) {
    // Real orchestrator run
    const recorder = new RealTrajectoryRecorder(
      options.providers,
      options.workspaceRoot ?? process.cwd(),
      options.toolOptions,
    );
    trajectory = await recorder.record(spec, options.mode);
  } else {
    // Synthetic fallback for offline/fast testing
    trajectory = buildSyntheticTrajectory(spec, options.mode);
  }

  const harness = new EvalHarness();
  harness.registerTask(spec);
  harness.recordTrajectory(trajectory);
  harness.scoreTask(spec.id);

  const runId = `eval-${Date.now()}-${spec.id}`;
  return harness.generateReport(runId);
}

/**
 * Render an EvalReport as a Markdown summary for `--format markdown`.
 */
export function formatEvalMarkdown(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Eval Report — ${report.runId}`);
  lines.push('');
  lines.push(`Generated: ${new Date(report.timestamp).toISOString()}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Total tasks: ${report.summary.totalTasks}`);
  lines.push(`- Passed: ${report.summary.passed}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push(`- Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`);
  lines.push(`- Avg cost: $${report.summary.avgCost.toFixed(4)}`);
  lines.push(`- Avg latency: ${Math.round(report.summary.avgLatency)} ms`);
  lines.push(`- Avg quality (heuristic unless judged): ${(report.summary.avgQuality * 100).toFixed(1)}%`);
  lines.push(`- Cost savings vs frontier: ${report.summary.costSavingsVsFrontier === null ? 'unavailable (no measured baseline)' : `${report.summary.costSavingsVsFrontier}%`}`);
  lines.push('');
  lines.push(`## Per-task results`);
  lines.push('');
  lines.push(`| Task | Pass | Quality | Cost score | Latency score | Overall |`);
  lines.push(`|------|------|---------|-----------|--------------|---------|`);
  for (const t of report.tasks) {
    lines.push(
      `| ${t.taskId} | ${t.success ? 'YES' : 'NO'} | ${(t.qualityScore * 100).toFixed(0)}% | ${(t.costScore * 100).toFixed(0)}% | ${(t.latencyScore * 100).toFixed(0)}% | ${(t.overallScore * 100).toFixed(0)}% |`,
    );
  }
  if (Object.keys(report.failureBreakdown).length > 0) {
    lines.push('');
    lines.push(`## Failure breakdown`);
    lines.push('');
    for (const [cat, n] of Object.entries(report.failureBreakdown)) {
      lines.push(`- ${cat}: ${n}`);
    }
  }
  return lines.join('\n');
}
