/**
 * `runToolCalls` — single shared helper that executes a batch of LLM-emitted
 * tool calls against the orchestrator's `ToolExecutorInterface`.
 *
 * This is the reused tool loop from the orchestrator's `executeToolCalls`
 * (session-orchestrator.ts). It is intentionally provider-agnostic: the
 * executors pass in an optional `toolExecutor`/`toolRegistry` and optional
 * `checkToolOutput` security check + `lintFile` edit-tool hook. The
 * orchestrator wires its real implementations; executors may pass `undefined`.
 *
 * Determinism / scope:
 *   - No new LLM calls. Pure tool side effects + events.
 *   - Security (`checkToolOutput`) and edit-tool linting are OPTIONAL and
 *     ported from session-orchestrator.ts (not copied — the real functions
 *     are injected by the orchestrator).
 */
import { EventStream } from '../event-stream.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { ToolCall, ToolCallResult } from '../types/agent.js';
export { runAgentToolLoop, countSourceFiles, type RunAgentToolLoopParams, type RunAgentToolLoopResult, type AgentToolLoopMode, type LoopChatMessage, } from './agent-tool-loop.js';
/** Shape of the security check injected by the orchestrator. */
export type ToolOutputCheck = (output: string, toolName?: string) => {
    safe: boolean;
    confidence: number;
    flags: string[];
};
/** Shape of the edit-tool linter hook injected by the orchestrator. */
export type LintFileFn = (path: string) => Promise<{
    passed: boolean;
    errors: string[];
}>;
export interface RunToolCallsParams {
    toolCalls: ToolCall[];
    toolExecutor: ToolExecutorInterface | null;
    /** Kept for API symmetry; executors may not need it directly. */
    toolRegistry?: ToolRegistryInterface | null;
    eventStream: EventStream;
    workspaceRoot: string;
    sessionId: string;
    signal?: AbortSignal;
    /** Optional prompt-injection guard (orchestrator passes `checkToolOutput`). */
    checkToolOutput?: ToolOutputCheck;
    /** Optional edit-tool linter (orchestrator passes its Biome linter). */
    lintFile?: LintFileFn;
}
/**
 * Execute each tool call and return a parallel-shaped result list, matching
 * the orchestrator's `executeToolCalls` contract exactly so results can be
 * handed to `buildToolResultMessages` downstream.
 */
export declare function runToolCalls(params: RunToolCallsParams): Promise<Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: ToolCallResult;
}>>;
//# sourceMappingURL=tool-execution-helper.d.ts.map