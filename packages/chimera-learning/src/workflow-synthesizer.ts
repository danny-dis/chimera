/**
 * WorkflowSynthesizer — generates workflow definitions from session patterns.
 *
 * Maps repeated tool sequences to chimera-core WorkflowDefinition steps.
 * Heuristics:
 *   - read_file, search_files → llm (analysis) step
 *   - edit_file, write_file → llm (implementation) step
 *   - run_shell_command → tool (test/execution) step
 *   - git_* → tool (version control) step
 *   - Sequential reads → parallel step (fan-out)
 *   - After writes → gate (quality check) step
 *
 * Generated workflows use the chimera-core step-based format
 * (WorkflowDefinition with WorkflowStep[]).
 */
import type {
  SessionPattern,
  DomainCluster,
  RepeatedSequence,
  SynthesizedWorkflow,
  WorkflowSynthesisResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

type ToolRole = 'read' | 'write' | 'execute' | 'vcs' | 'search' | 'unknown';

const TOOL_ROLES: Record<string, ToolRole> = {
  read_file: 'read',
  list_files: 'read',
  search_files: 'search',
  glob_files: 'search',
  edit_file: 'write',
  write_file: 'write',
  run_shell_command: 'execute',
  git_status: 'vcs',
  git_diff: 'vcs',
  git_log: 'vcs',
  git_add: 'vcs',
  git_commit: 'vcs',
  git_checkout: 'vcs',
  skill: 'unknown',
  web_search: 'search',
  web_fetch: 'search',
  lsp_diagnostics: 'search',
  lsp_definition: 'search',
  lsp_references: 'search',
};

function classifyTool(tool: string): ToolRole {
  return TOOL_ROLES[tool] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Sequence → Steps conversion
// ---------------------------------------------------------------------------

function mapSequenceToSteps(
  sequence: string[],
  _domain: string,
): SynthesizedWorkflow['steps'] {
  const steps: SynthesizedWorkflow['steps'] = [];
  let stepCounter = 0;

  // Group consecutive reads into parallel batches
  const readBatch: string[] = [];
  const flushReadBatch = () => {
    if (readBatch.length === 0) return;
    if (readBatch.length === 1) {
      steps.push({
        id: `analyze-${stepCounter++}`,
        kind: 'llm',
        config: {
          role: 'writer',
          prompt: `Read and analyze the file using ${readBatch[0]}. Understand the current implementation.`,
        },
      });
    } else {
      steps.push({
        id: `analyze-batch-${stepCounter++}`,
        kind: 'parallel',
        config: {
          branches: readBatch.map((tool, i) => ({
            id: `read-${i}`,
            kind: 'llm',
            config: {
              role: 'writer',
              prompt: `Read a file using ${tool}. Extract relevant information.`,
            },
          })),
        },
      });
    }
    readBatch.length = 0;
  };

  for (const tool of sequence) {
    const role = classifyTool(tool);

    switch (role) {
      case 'read':
      case 'search':
        readBatch.push(tool);
        break;

      case 'write':
        flushReadBatch();
        steps.push({
          id: `implement-${stepCounter++}`,
          kind: 'llm',
          config: {
            role: 'writer',
            prompt: `Implement changes using ${tool}. Apply the planned modifications.`,
          },
        });
        break;

      case 'execute':
        flushReadBatch();
        steps.push({
          id: `execute-${stepCounter++}`,
          kind: 'tool',
          config: {
            name: tool,
            args: {},
          },
        });
        break;

      case 'vcs':
        flushReadBatch();
        steps.push({
          id: `vcs-${stepCounter++}`,
          kind: 'tool',
          config: {
            name: tool,
            args: {},
          },
        });
        break;

      default:
        flushReadBatch();
        steps.push({
          id: `step-${stepCounter++}`,
          kind: 'llm',
          config: {
            role: 'writer',
            prompt: `Perform action using ${tool}.`,
          },
        });
        break;
    }
  }

  flushReadBatch();

  // Add a quality gate after the last write (if any writes happened)
  const hasWrites = sequence.some(t => classifyTool(t) === 'write');
  if (hasWrites) {
    steps.push({
      id: `verify-${stepCounter++}`,
      kind: 'gate',
      config: {
        condition: 'verdict === "PASS"',
      },
      required: false,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Workflow name generation
// ---------------------------------------------------------------------------

function generateWorkflowName(domain: string, patterns: SessionPattern[]): string {
  const slug = domain.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const suffix = patterns.length > 1 ? 'multi' : 'single';
  return `${slug}-${suffix}-workflow`;
}

function generateWorkflowDescription(domain: string, patterns: SessionPattern[]): string {
  const successRate = patterns.filter(p => p.quality.status === 'done').length / patterns.length;
  return (
    `Auto-generated workflow for ${domain} tasks. ` +
    `Based on ${patterns.length} session(s) with ${Math.round(successRate * 100)}% success rate.`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class WorkflowSynthesizer {
  /**
   * Convert a RepeatedSequence into a workflow definition.
   */
  synthesizeFromSequence(sequence: RepeatedSequence): WorkflowSynthesisResult {
    const domain = sequence.domainKeywords[0] ?? 'general';
    const steps = mapSequenceToSteps(sequence.sequence, domain);

    return {
      workflow: {
        name: `sequence-${domain}-workflow`,
        description: `Auto-generated from repeated ${domain} sequence (freq: ${sequence.frequency}, success: ${Math.round(sequence.successRate * 100)}%)`,
        steps,
        tags: ['auto-generated', domain, ...sequence.domainKeywords.slice(0, 3)],
      },
      action: 'create',
      confidence: sequence.successRate * Math.min(sequence.frequency / 3, 1),
      sourceSessionIds: [], // sequences don't carry session IDs
    };
  }

  /**
   * Generate a workflow from a domain cluster's common patterns.
   */
  synthesizeFromCluster(cluster: DomainCluster): WorkflowSynthesisResult {
    // Merge all successful tool sequences in the cluster
    const successfulSequences = cluster.sessions
      .filter(s => s.quality.status === 'done')
      .map(s => s.tools.sequence);

    const mergedSequence = mergeSequences(successfulSequences);
    const steps = mapSequenceToSteps(mergedSequence, cluster.topic);

    return {
      workflow: {
        name: generateWorkflowName(cluster.topic, cluster.sessions),
        description: generateWorkflowDescription(cluster.topic, cluster.sessions),
        steps,
        tags: ['auto-generated', cluster.topic, ...cluster.keywords.slice(0, 5)],
      },
      action: 'create',
      confidence: cluster.successRate * Math.min(cluster.sessions.length / 3, 1),
      sourceSessionIds: cluster.sessions.map(s => s.sessionId),
    };
  }

  /**
   * Improve an existing workflow based on new session data.
   */
  improveExisting(
    existing: { name: string; description?: string; steps: Array<{ id: string; kind: string; config: Record<string, unknown> }> },
    patterns: SessionPattern[],
  ): WorkflowSynthesisResult {
    // Analyze where sessions deviated from the workflow
    const successfulPatterns = patterns.filter(p => p.quality.status === 'done');
    const failedPatterns = patterns.filter(p => p.quality.status !== 'done');

    // Build improved steps from successful patterns
    const mergedSequence = mergeSequences(successfulPatterns.map(p => p.tools.sequence));
    const steps = mapSequenceToSteps(mergedSequence, existing.name);

    // Add lessons from failures
    const failureReasons = failedPatterns.flatMap(p => p.quality.failures.map(f => f.reason));
    const description = existing.description
      ? `${existing.description} (improved from ${patterns.length} sessions, ${failureReasons.length} failure lessons)`
      : `Improved from ${patterns.length} sessions`;

    return {
      workflow: {
        name: existing.name,
        description,
        steps,
        tags: ['auto-generated', 'improved'],
      },
      action: 'update',
      confidence: Math.min(successfulPatterns.length / 3, 1),
      sourceSessionIds: patterns.map(s => s.sessionId),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeSequences(sequences: string[][]): string[] {
  if (sequences.length === 0) return [];
  if (sequences.length === 1) return sequences[0];

  const maxLen = Math.max(...sequences.map(s => s.length));
  const merged: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const candidates = sequences
      .map(s => s[i])
      .filter((t): t is string => t !== undefined);

    if (candidates.length === 0) break;

    const counts: Record<string, number> = {};
    for (const c of candidates) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    if (merged.length === 0 || merged[merged.length - 1] !== best) {
      merged.push(best);
    }
  }

  return merged;
}
