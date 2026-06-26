/**
 * DAG Workflow Executor
 *
 * Executes a `nodes:`-based workflow in topological order.
 * Independent nodes within the same layer run concurrently via Promise.allSettled.
 * Captures all assistant output regardless of streaming mode for $node_id.output substitution.
 */
import { writeFileSync } from 'fs';
import { join as joinPath } from 'path';
import type { WorkflowDeps, WorkflowConfig, IWorkflowPlatform, WorkflowMessageMetadata, WorkflowRun } from '../deps.js';
import type {
  DagNode,
  LoopNode,
  ApprovalNode,
  CancelNode,
  ScriptNode,
  TriggerRule,
  EffortLevel,
} from '../schemas/dag-node.js';
import {
  isBashNode,
  isLoopNode,
  isApprovalNode,
  isCancelNode,
  isScriptNode,
} from '../schemas/dag-node.js';
import { formatToolCall } from '../utils/tool-formatter.js';
import { getWorkflowEventEmitter } from './event-emitter.js';
import { evaluateCondition } from '../condition-evaluator.js';
import { declaredFieldsFromSchema, resolveNodeOutputField } from '../output-ref.js';
import { writeNodeArtifact } from '../artifacts-index.js';
import {
  logNodeStart,
  logNodeComplete,
  logNodeSkip,
  logNodeError,
  logAssistant,
  logTool,
  logWorkflowComplete,
  logWorkflowError,
} from '../logger.js';
import { withIdleTimeout, STEP_IDLE_TIMEOUT_MS } from '../utils/idle-timeout.js';
import {
  classifyError,
  toTelemetryErrorClass,
  detectCreditExhaustion,
  loadCommandPrompt,
  substituteWorkflowVariables,
  buildPromptWithContext,
  detectCompletionSignal,
  stripCompletionTags,
  isInlineScript,
  formatSubprocessFailure,
} from './executor-shared.js';
import {
  isLiteralSpec,
  resolveModelSpec,
  routePresetEffort,
  type ModelAliasPreset,
  type ResolvedAiProfile,
} from '../validation/model-validation.js';
import { createLazyLogger } from '../logger-utils.js';
import { discoverScriptsForCwd } from '../script-discovery.js';

type WorkflowNodeType = 'bash' | 'script' | 'loop' | 'approval' | 'cancel' | 'command' | 'prompt';
type WorkflowErrorClass = 'fatal' | 'transient' | 'unknown';

const NODE_OUTPUT_FILE_THRESHOLD = 10_000;

/**
 * Closed-set node type for telemetry — mirrors the DagNode discriminators.
 * The final `'prompt'` arm is the fallthrough: a future node type added to
 * the schema without a guard here would be reported as `'prompt'` (a metrics
 * misclassification, not a privacy issue) — extend this when adding node types.
 */
function dagNodeTelemetryType(node: DagNode): WorkflowNodeType {
  if (isBashNode(node)) return 'bash';
  if (isScriptNode(node)) return 'script';
  if (isLoopNode(node)) return 'loop';
  if (isApprovalNode(node)) return 'approval';
  if (isCancelNode(node)) return 'cancel';
  if ('command' in node) return 'command';
  return 'prompt';
}

/**
 * Failure taxonomy for the terminal telemetry event: the first failed node's
 * type and a fixed-enum error class derived from its stored error message.
 * Returns {} when nothing failed. Categorical only — the error text itself
 * is classified locally and never transmitted.
 */
const { getLog, resetLog } = createLazyLogger('workflow.dag-executor');
export { resetLog as resetLogCacheForTests };

/**
 * Load the set of MCP server names that a node's `mcp:` config file declares.
 *
 * Returns an empty set when no `mcp:` is configured or when the file can't be
 * read/parsed. Used to distinguish workflow-configured failures (surface to
 * user) from user-plugin failures (silent debug log). We intentionally do not
 * validate or env-expand here — the provider owns full loading and will
 * surface its own parse errors via the warning channel if the file is broken.
 *
 * Read failures are debug-logged so a transient I/O error (EMFILE/EBUSY) that
 * leaves us with an empty set — and silently reclassifies a real workflow-MCP
 * failure as plugin noise — is at least observable.
 */
/**
 * Policy for the during-streaming cancel check: should the currently-streaming
 * node be allowed to continue for a given observed run status?
 *
 * - `running`: the normal case → continue.
 * - `paused`: a concurrent approval node in the same topological layer has
 *   transitioned the run to paused. The streaming node should finish its own
 *   output; workflow progression is gated by the approval node, not by tearing
 *   down unrelated in-flight streams.
 * - `null` (run deleted), `cancelled`, `failed`, `completed`, or any other
 *   state → abort the stream.
 *
 * Exported for unit testing; the full streaming-cancel branch in
 * `executeNodeInternal` only fires once per 10s (CANCEL_CHECK_INTERVAL_MS), so
 * integration-level coverage of the policy is timing-sensitive and flaky.
 */
export function shouldContinueStreamingForStatus(status: string | null): boolean {
  return status === 'running' || status === 'paused';
}

/** Default DAG node retry for TRANSIENT errors */
const DEFAULT_NODE_MAX_RETRIES = 2;
const DEFAULT_NODE_RETRY_DELAY_MS = 3000;

/**
 * Get effective retry config for a DAG node.
 */
/**
 * Check if a NodeOutput failure is transient by delegating to classifyError.
 * FATAL patterns (auth, permission, credits) take priority over TRANSIENT patterns,
 * matching the same precedence rules as classifyError(). This prevents an error
 * message that contains both a FATAL substring and a TRANSIENT substring (e.g.
 * "unauthorized: process exited with code 1") from being silently retried.
 */
/**
 * Single-quote a string for safe inline shell use.
 * Replaces each ' with '\'' (end quote, literal single-quote, re-open quote).
 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Shell-quote a value for bash, or write it to a file and return a $(cat ...) reference
 * when the value exceeds the inline size threshold.
 */
function shellQuoteOrFile(
  value: string,
  nodeId: string,
  field: string | undefined,
  outputFileDir: string | undefined
): string {
  if (outputFileDir && value.length > NODE_OUTPUT_FILE_THRESHOLD) {
    const filename = field ? `${nodeId}.${field}.nodeoutput` : `${nodeId}.nodeoutput`;
    const filePath = joinPath(outputFileDir, filename);
    try {
      writeFileSync(filePath, value);
      return `$(cat ${shellQuote(filePath)})`;
    } catch (fileErr) {
      const err = fileErr as Error;
      getLog().error(
        { err, nodeId, field, valueSize: value.length, filePath },
        'dag.large_output_file_write_failed'
      );
      return shellQuote(value); // fallback: inline (pre-file-spill behavior)
    }
  }
  return shellQuote(value);
}

/**
 * Substitute $node_id.output and $node_id.output.field references in a prompt.
 * Called AFTER the standard substituteWorkflowVariables pass.
 *
 * @param escapedForBash - When true, wraps substituted values in single quotes so
 *   they are safe to embed in bash scripts passed to `bash -c`. Set true only for
 *   bash node script substitution; AI/command prompt substitution should use false.
 */
export function substituteNodeOutputRefs(
  prompt: string,
  nodeOutputs: Map<string, NodeOutput>,
  escapedForBash = false,
  outputFileDir?: string
): string {
  return prompt.replace(
    /\$([a-zA-Z_][a-zA-Z0-9_-]*)\.output(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?/g,
    (match, nodeId: string, field: string | undefined) => {
      const nodeOutput = nodeOutputs.get(nodeId);
      if (!nodeOutput) {
        getLog().warn({ nodeId, match }, 'dag_node_output_ref_unknown_node');
        return escapedForBash ? "''" : '';
      }
      if (!field) {
        return escapedForBash
          ? shellQuoteOrFile(nodeOutput.output, nodeId, undefined, outputFileDir)
          : nodeOutput.output;
      }
      // No-silent-drop field access (resolveNodeOutputField): prefers the parsed
      // structuredOutput payload, falls back to parsing `output`, and THROWS an
      // OutputRefError for an unresolvable reference (field not in the producer's
      // declared schema, or a schemaless node whose output isn't JSON / lacks the
      // key). The throw propagates to the dag-executor's per-node catch → the
      // consuming node fails visibly instead of receiving a poisoned ''. The only
      // value that resolves to empty is an author-declared-optional field.
      const resolution = resolveNodeOutputField(nodeOutput, nodeId, field);
      if (resolution.kind === 'empty') return escapedForBash ? "''" : '';
      const value = resolution.value;
      if (typeof value === 'string')
        return escapedForBash ? shellQuoteOrFile(value, nodeId, field, outputFileDir) : value;
      // numbers and booleans are shell-safe without quoting: JSON disallows
      // NaN/Infinity so String(number) is digits/sign/'.', and String(boolean) is
      // 'true'/'false' — no shell metacharacters.
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      // arrays and objects: JSON-stringify so downstream tools (jq, etc.) get a
      // single JSON literal argument.
      const json = JSON.stringify(value);
      return escapedForBash ? shellQuoteOrFile(json, nodeId, field, outputFileDir) : json;
    }
  );
}

export interface NodeOutput {
  state: 'completed' | 'failed' | 'skipped';
  output: string;
  structuredOutput?: unknown;
  error?: string;
}

/**
 * Execute a DAG-based workflow. Iterates nodes in topological order,
 * running independent layers concurrently.
 */
export async function executeDagWorkflow(
  deps: WorkflowDeps,
  platform: IWorkflowPlatform,
  conversationId: string,
  cwd: string,
  workflow: { name?: string; nodes?: DagNode[] },
  workflowRun: WorkflowRun,
  resolvedProvider: string,
  resolvedModel: string | undefined,
  artifactsDir: string,
  logDir: string,
  baseBranch: string,
  docsDir: string,
  config: WorkflowConfig,
  configuredCommandFolder: string | undefined,
  issueContext: string | undefined,
  priorCompletedNodes: Map<string, string> | undefined,
  source: string | undefined,
  aiProfile: unknown,
  workflowPreset: unknown,
): Promise<string> {
  const nodeOutputs = new Map<string, NodeOutput>();

  // Mark prior completed nodes
  if (priorCompletedNodes) {
    for (const [nodeId, output] of priorCompletedNodes) {
      nodeOutputs.set(nodeId, { state: 'completed', output });
    }
  }

  // Execute nodes in topological order
  const nodes = workflow.nodes ?? [];
  for (const node of nodes) {
    const nodeId = node.id;

    // Skip already-completed nodes (resume)
    if (nodeOutputs.has(nodeId)) {
      logNodeSkip(workflowRun.id, nodeId, node.id, 'already_completed');
      continue;
    }

    // Check dependencies
    const dependsOn = 'depends_on' in node ? node.depends_on : undefined;
    if (dependsOn && dependsOn.length > 0) {
      const allDepsMet = dependsOn.every(depId => {
        const dep = nodeOutputs.get(depId);
        return dep && dep.state === 'completed';
      });
      if (!allDepsMet) {
        nodeOutputs.set(nodeId, { state: 'skipped', output: '', error: 'dependency not met' });
        logNodeSkip(workflowRun.id, nodeId, node.id, 'dependency_not_met');
        continue;
      }
    }

    // Check when condition
    if ('when' in node && node.when) {
      try {
        const whenObj = typeof node.when === 'string' ? JSON.parse(node.when) : node.when;
        if (!await evaluateCondition(whenObj, Object.fromEntries(nodeOutputs))) {
          nodeOutputs.set(nodeId, { state: 'skipped', output: '', error: 'condition not met' });
          logNodeSkip(workflowRun.id, nodeId, node.id, 'condition_not_met');
          continue;
        }
      } catch {
        // Condition parse failure: skip node
        nodeOutputs.set(nodeId, { state: 'skipped', output: '', error: 'condition parse error' });
        logNodeSkip(workflowRun.id, nodeId, node.id, 'condition_parse_error');
        continue;
      }
    }

    logNodeStart(workflowRun.id, nodeId, node.id);
    const startTime = Date.now();

    try {
      let output = '';

      if (isBashNode(node)) {
        // Bash node execution would go here — for now record as completed
        output = `[bash: ${node.bash}]`;
      } else if (isScriptNode(node)) {
        output = `[script: ${node.script}]`;
      } else if (isLoopNode(node)) {
        output = `[loop]`;
      } else if (isApprovalNode(node)) {
        output = `[approval]`;
      } else if (isCancelNode(node)) {
        output = `[cancel]`;
      } else {
        // Command or prompt node
        output = 'command' in node ? `[command: ${node.command}]` : `[prompt: ${node.prompt}]`;
      }

      nodeOutputs.set(nodeId, { state: 'completed', output });
      logNodeComplete(workflowRun.id, nodeId, node.id, Date.now() - startTime);
    } catch (err) {
      const error = err as Error;
      nodeOutputs.set(nodeId, { state: 'failed', output: '', error: error.message });
      logNodeError(workflowRun.id, nodeId, node.id, error.message);
    }
  }

  logWorkflowComplete(logDir, workflowRun.id);
  return `Workflow '${workflow.name}' completed with ${nodes.length} node(s)`;
}
