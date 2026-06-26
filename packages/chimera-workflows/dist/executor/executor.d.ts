import type { IWorkflowPlatform, WorkflowRun } from '../deps';
import type { WorkflowDeps } from '../deps';
import type { WorkflowDefinition, WorkflowExecutionResult, WorkflowSource } from '../schemas/workflow';
declare const resetLog: () => void;
export { resetLog as resetLogCacheForTests };
/**
 * Resume payload. `priorCompletedNodes` may only appear together with
 * `preCreatedRun` — passing completed-node outputs without the resumed row
 * would silently inject node-skip state into a freshly-created run. Lock-token
 * rows (used by `dispatchBackgroundWorkflow`) supply `preCreatedRun` alone.
 */
type ResumePayload = {
    preCreatedRun: WorkflowRun;
    priorCompletedNodes?: Map<string, string>;
} | {
    preCreatedRun?: undefined;
    priorCompletedNodes?: undefined;
};
/**
 * Optional parameters for {@link executeWorkflow}. All trailing args live here
 * so call sites stay readable as new options accrue.
 *
 * To resume a prior run, obtain `preCreatedRun` + `priorCompletedNodes` from
 * {@link hydrateResumableRun} (or look up via `findResumableRun` and hydrate)
 * and spread them in. The executor never queries the store for a prior run on
 * its own; that decision belongs at the call site.
 */
export type ExecuteWorkflowOptions = ResumePayload & {
    /** Codebase ID for env vars + isolation context. */
    codebaseId?: string;
    /**
     * GitHub issue/PR context. When provided:
     * - Stored in `WorkflowRun.metadata` as `{ github_context }`
     * - Substituted into `$CONTEXT` / `$EXTERNAL_CONTEXT` / `$ISSUE_CONTEXT` variables
     * - Appended to prompts that reference none of those variables
     * Expected format: Markdown with title, author, labels, and body.
     */
    issueContext?: string;
    /** Worktree / branch metadata for isolation-aware nodes. */
    isolationContext?: {
        branchName?: string;
        isPrReview?: boolean;
        prSha?: string;
        prBranch?: string;
    };
    /**
     * Discovery source of the workflow (bundled / global / project). Used only
     * for anonymous telemetry — bundled workflows report their real name, custom
     * ones report `"custom"`. Optional: defaults to the `"custom"`/project
     * treatment when a caller doesn't thread it through.
     */
    source?: WorkflowSource;
    /** Parent conversation ID — enables approve/reject auto-resume from chat. */
    parentConversationId?: string;
    /**
     * Archon user UUID for attribution on the workflow_run row. Resolved by
     * chat/forge adapters via findOrCreateUserByPlatformIdentity. Web/CLI paths
     * pass undefined until their own auth surfaces are wired.
     * Ignored when `preCreatedRun` is set — the original creator's attribution
     * is preserved on resume.
     */
    userId?: string;
};
/**
 * Hydrate an already-located resumable `WorkflowRun` candidate into the form
 * {@link executeWorkflow} expects. Returns `null` when the candidate has no
 * completed nodes and no interactive-loop gate state — nothing worth resuming.
 *
 * The return shape is spread-compatible with {@link ExecuteWorkflowOptions}
 * so callers can write `executeWorkflow(..., { ...hydrated, codebaseId })`.
 *
 * Throws on database errors; callers decide whether to surface or fall
 * through. The executor itself never performs this lookup — silent fallback
 * inside the executor was the cross-invocation auto-resume bug, so it stays
 * at the call site.
 */
export declare function hydrateResumableRun(deps: WorkflowDeps, candidate: WorkflowRun): Promise<{
    preCreatedRun: WorkflowRun;
    priorCompletedNodes: Map<string, string>;
} | null>;
/**
 * Execute a complete DAG-based workflow.
 *
 * Required positional args carry identity and dependencies. Everything else
 * lives in `opts` ({@link ExecuteWorkflowOptions}). To resume a prior run,
 * call {@link hydrateResumableRun} first and spread its result into `opts` —
 * the executor does not perform resume detection on its own.
 */
export declare function executeWorkflow(deps: WorkflowDeps, platform: IWorkflowPlatform, conversationId: string, cwd: string, workflow: WorkflowDefinition, userMessage: string, conversationDbId: string, opts?: ExecuteWorkflowOptions): Promise<WorkflowExecutionResult>;
//# sourceMappingURL=executor.d.ts.map