import type { WorkflowDeps, WorkflowConfig, IWorkflowPlatform, WorkflowRun } from '../deps.js';
import type { DagNode } from '../schemas/dag-node.js';
/**
 * Failure taxonomy for the terminal telemetry event: the first failed node's
 * type and a fixed-enum error class derived from its stored error message.
 * Returns {} when nothing failed. Categorical only — the error text itself
 * is classified locally and never transmitted.
 */
declare const resetLog: () => void;
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
export declare function shouldContinueStreamingForStatus(status: string | null): boolean;
/**
 * Substitute $node_id.output and $node_id.output.field references in a prompt.
 * Called AFTER the standard substituteWorkflowVariables pass.
 *
 * @param escapedForBash - When true, wraps substituted values in single quotes so
 *   they are safe to embed in bash scripts passed to `bash -c`. Set true only for
 *   bash node script substitution; AI/command prompt substitution should use false.
 */
export declare function substituteNodeOutputRefs(prompt: string, nodeOutputs: Map<string, NodeOutput>, escapedForBash?: boolean, outputFileDir?: string): string;
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
export declare function executeDagWorkflow(deps: WorkflowDeps, platform: IWorkflowPlatform, conversationId: string, cwd: string, workflow: {
    name?: string;
    nodes?: DagNode[];
}, workflowRun: WorkflowRun, resolvedProvider: string, resolvedModel: string | undefined, artifactsDir: string, logDir: string, baseBranch: string, docsDir: string, config: WorkflowConfig, configuredCommandFolder: string | undefined, issueContext: string | undefined, priorCompletedNodes: Map<string, string> | undefined, source: string | undefined, aiProfile: unknown, workflowPreset: unknown): Promise<string>;
//# sourceMappingURL=dag-executor.d.ts.map