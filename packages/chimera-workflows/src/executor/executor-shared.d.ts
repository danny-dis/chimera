import type { IWorkflowPlatform, WorkflowDeps } from '../deps.js';
import type { LoadCommandResult } from '../schemas/workflow.js';
type WorkflowErrorClass = 'fatal' | 'transient' | 'unknown';
declare const resetLog: () => void;
export { resetLog as resetLogCacheForTests };
/** Result of error classification */
export type ErrorType = 'TRANSIENT' | 'FATAL' | 'UNKNOWN';
/** Fatal error patterns - authentication/authorization issues that won't resolve with retry */
export declare const FATAL_PATTERNS: string[];
/** Transient error patterns - temporary issues that may resolve with retry */
export declare const TRANSIENT_PATTERNS: string[];
/**
 * Check if error message matches any pattern in the list.
 */
export declare function matchesPattern(message: string, patterns: string[]): boolean;
/**
 * Classify an error to determine if it's transient (can retry) or fatal (should fail).
 * FATAL patterns take priority over TRANSIENT patterns to prevent an error message
 * containing both (e.g. "unauthorized: process exited with code 1") from being retried.
 */
export declare function classifyError(error: Error): ErrorType;
/**
 * Map the retry-oriented {@link ErrorType} to the telemetry wire enum. The
 * telemetry event carries ONLY this fixed-enum class — never error text.
 */
export declare function toTelemetryErrorClass(errorType: ErrorType): WorkflowErrorClass;
/**
 * Raw ExecFileException shape from Node's `child_process.execFile`. For inline
 * scripts via `bash -c <body>` / `bun -e <body>` the entire script body is
 * embedded in `err.message`, `err.cmd`, and the first line of `err.stack` —
 * which is why `formatSubprocessFailure` strips the prefix and exposes a
 * controlled `logFields` subset rather than the raw error.
 */
interface RawSubprocessError {
    message?: string;
    stderr?: string;
    stdout?: string;
    code?: number | string | null;
    killed?: boolean;
    cmd?: string;
}
/**
 * Produce a concise, diagnostic-first summary of a failed subprocess.
 *
 * User-visible output strips Node's `"Command failed: <cmd>"` prefix (which for
 * inline scripts contains the full script body) and prefers stderr when present.
 * Log fields expose a controlled, tail-truncated subset — never the full `err`
 * object, to prevent Pino's default error serializer from emitting three copies
 * of the script body (`err.message`, `err.stack`, `err.cmd`).
 */
export declare function formatSubprocessFailure(err: RawSubprocessError, label: string): {
    userMessage: string;
    logFields: Record<string, unknown>;
};
/**
 * Detect credit/session-limit exhaustion in streamed node output text.
 *
 * The Claude SDK surfaces both subscription session limits and pay-per-token
 * credit exhaustion as normal assistant text messages rather than thrown errors.
 * This function checks the accumulated output for known phrases and returns an
 * actionable error string, or null if no limit is detected.
 *
 * @returns null if no limit detected; a session-limit string (instructs user to
 * abandon and retry after reset) or a credit-exhaustion string (instructs user
 * to resume when credits refill).
 */
export declare function detectCreditExhaustion(text: string): string | null;
/**
 * Load command prompt from file.
 *
 * @param deps - Workflow dependencies (for config loading)
 * @param cwd - Working directory (repo root)
 * @param commandName - Name of the command (without .md extension)
 * @param configuredFolder - Optional additional folder from config to search
 * @returns On success: `{ success: true, content }`. On failure: `{ success: false, reason, message }`.
 */
export declare function loadCommandPrompt(deps: WorkflowDeps, cwd: string, commandName: string, configuredFolder?: string): Promise<LoadCommandResult>;
/** Pattern string for context variables - used to create fresh regex instances */
export declare const CONTEXT_VAR_PATTERN_STR = "\\$(?:CONTEXT|EXTERNAL_CONTEXT|ISSUE_CONTEXT)(?![A-Za-z0-9_])";
/**
 * Substitute workflow variables in a prompt.
 *
 * Supported variables:
 * - $WORKFLOW_ID - The workflow run ID
 * - $USER_MESSAGE, $ARGUMENTS - The user's trigger message
 * - $ARTIFACTS_DIR - External artifacts directory for this workflow run
 * - $BASE_BRANCH - The base branch (from config or auto-detected)
 * - $CONTEXT, $EXTERNAL_CONTEXT, $ISSUE_CONTEXT - GitHub issue/PR context (if available)
 * - $DOCS_DIR - Documentation directory path (configured or default 'docs/')
 * - $LOOP_USER_INPUT - User feedback from interactive loop approval. Only populated on the
 *   first iteration of a resumed interactive loop; empty string on all other iterations.
 * - $REJECTION_REASON - Reviewer feedback from approval node rejection (on_reject prompts only).
 * - $LOOP_PREV_OUTPUT - Cleaned output of the previous loop iteration. Empty string on the
 *   first iteration (no prior output exists). Useful for fresh_context loops that need
 *   to reference what the previous pass produced or why it failed.
 *
 * When issueContext is undefined, context variables are replaced with empty string
 * to avoid sending literal "$CONTEXT" to the AI.
 */
export declare function substituteWorkflowVariables(prompt: string, workflowId: string, userMessage: string, artifactsDir: string, baseBranch: string, docsDir: string, issueContext?: string, loopUserInput?: string, rejectionReason?: string, loopPrevOutput?: string, options?: {
    shellSafe?: boolean;
}): {
    prompt: string;
    contextSubstituted: boolean;
};
/**
 * Apply variable substitution and optionally append issue context.
 * Appends context only if it wasn't already substituted via $CONTEXT variables.
 * This prevents duplicate context being sent to the AI.
 *
 * @param template - The command prompt template with variable placeholders
 * @param workflowId - The workflow run ID for variable substitution
 * @param userMessage - The user's trigger message for variable substitution
 * @param artifactsDir - The external artifacts directory for $ARTIFACTS_DIR substitution
 * @param baseBranch - The resolved base branch for $BASE_BRANCH substitution
 * @param docsDir - The resolved docs directory for $DOCS_DIR substitution
 * @param issueContext - Optional GitHub issue/PR context to substitute or append
 * @param logLabel - Human-readable label for logging (e.g., 'workflow step prompt')
 * @returns The final prompt with variables substituted and context optionally appended
 */
export declare function buildPromptWithContext(template: string, workflowId: string, userMessage: string, artifactsDir: string, baseBranch: string, docsDir: string, issueContext: string | undefined, logLabel: string): string;
/**
 * Detect whether the AI output contains a completion signal.
 *
 * Supports three formats, checked in order:
 * 1. <promise>SIGNAL</promise> - Recommended; prevents false positives in prose
 * 2. <anytag>SIGNAL</anytag> - Any XML-wrapped tag; case-insensitive on tag names
 * 3. Plain SIGNAL - Backwards compatibility; only at end of output or on own line
 *
 * Tag matching uses a backreference (\1) so opening and closing tag names must
 * agree — `<COMPLETE>X</done>` is not treated as a completion, which avoids
 * false positives when the AI interleaves tags in prose.
 *
 * Plain signal detection is restrictive to prevent false positives like "not SIGNAL yet".
 */
export declare function detectCompletionSignal(output: string, signal: string): boolean;
/**
 * Strip internal completion signal tags before sending to user-facing output.
 * Always strips `<promise>…</promise>` (any content). When `until` is provided,
 * also strips any XML-wrapped form of that signal with matching tag names
 * (e.g. `<COMPLETE>ALL_CLEAN</COMPLETE>`). Mismatched tag names are left alone
 * so regular prose (`<note>ALL_CLEAN</warning>`) isn't accidentally rewritten.
 */
export declare function stripCompletionTags(content: string, until?: string): string;
/**
 * Determine whether a script string is "inline" code or a named script reference.
 * A named script is a simple identifier (no newlines, no whitespace, no shell metacharacters).
 * Used by both the DAG executor (runtime dispatch) and the validator (resource checks).
 */
export declare function isInlineScript(script: string): boolean;
export interface SendMessageContext {
    workflowId?: string;
    [key: string]: unknown;
}
export declare function safeSendMessage(platform: IWorkflowPlatform, conversationId: string, message: string, context?: SendMessageContext): Promise<boolean>;
//# sourceMappingURL=executor-shared.d.ts.map