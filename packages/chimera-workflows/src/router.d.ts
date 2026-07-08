/**
 * Workflow Router - builds prompts and detects workflow invocation
 */
import type { WorkflowDefinition } from './schemas/workflow.js';
declare const resetLog: () => void;
export { resetLog as resetLogCacheForTests };
/**
 * Optional context for router to make informed decisions.
 * Constructed by the orchestrator from platform type, issue context strings, and isolation hints.
 */
export interface RouterContext {
    /** Platform type identifier from the adapter (e.g., 'github', 'slack', 'telegram', 'test') */
    platformType?: string;
    /** Whether this is a PR vs issue - currently only relevant for GitHub */
    isPullRequest?: boolean;
    /** Issue or PR title */
    title?: string;
    /** Issue or PR labels */
    labels?: string[];
    /** Thread/comment history - previous messages for context */
    threadHistory?: string;
    /** Workflow type hint (e.g., 'pr-review', 'issue', etc.) */
    workflowType?: string;
}
/**
 * Build the router prompt with available workflows and optional context.
 * Context helps the router make better routing decisions by understanding the situation.
 * Instructs AI to use /invoke-workflow command.
 */
export declare function buildRouterPrompt(userMessage: string, workflows: readonly WorkflowDefinition[], context?: RouterContext): string;
/**
 * Result of parsing a message for workflow invocation
 */
export interface WorkflowInvocation {
    workflowName: string | null;
    remainingMessage: string;
    /** Error message when workflow name was detected but didn't match */
    error?: string;
}
/**
 * Parse a message to detect /invoke-workflow command
 */
export declare function parseWorkflowInvocation(message: string, workflows: readonly WorkflowDefinition[]): WorkflowInvocation;
/**
 * Find a workflow by name
 */
export declare function findWorkflow(name: string, workflows: readonly WorkflowDefinition[]): WorkflowDefinition | undefined;
/**
 * Resolve a workflow by name using a 4-tier fallback hierarchy:
 * 1. Exact match
 * 2. Case-insensitive match
 * 3. Suffix match (e.g. "assist" → "archon-assist")
 * 4. Substring match (e.g. "smart" → "archon-smart-pr-review")
 *
 * Returns the matched workflow, or undefined if no match found.
 * Throws an Error if multiple workflows match at the same tier (ambiguous).
 */
export declare function resolveWorkflowName(name: string, workflows: readonly WorkflowDefinition[]): WorkflowDefinition | undefined;
//# sourceMappingURL=router.d.ts.map