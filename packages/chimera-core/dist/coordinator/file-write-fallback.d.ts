/**
 * Shared fallback for writer models that *narrate* file operations in prose
 * (e.g. "### ACTION: WRITE greeter.js" followed by a code block) instead of
 * emitting native tool calls. Many small/free models ignore `tool_choice`,
 * so the orchestrator would otherwise report `done` with zero files written —
 * a silent false-success.
 *
 * `parseProseActions` extracts those narration blocks into `write_file` /
 * `edit_file` ToolCalls; `executeProseActions` runs them through the same
 * `runToolCalls` executor the real tool path uses, so the on-disk result is
 * identical to a genuine tool call.
 */
import { EventStream } from '../event-stream.js';
import type { ToolCall } from '../types/agent.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
/**
 * Parse writer prose into file-operation tool calls.
 * Handles three common narration shapes:
 *   1) `### ACTION: WRITE <path>` + fenced code block
 *   2) `### ACTION: EDIT <path>` + OLD:/NEW: fenced blocks
 *   3) `**DELTA:** <path>[:lines]` + fenced code block
 *   4) `write_file("<path>")` / `File: <path>` followed by a fenced block
 */
export declare function parseProseActions(text: string, expectedPath?: string): ToolCall[];
export interface ExecuteProseDeps {
    eventStream: EventStream;
    toolExecutor: ToolExecutorInterface | null;
    toolRegistry?: ToolRegistryInterface | null;
    workspaceRoot: string;
    sessionId: string;
    expectedPath?: string;
}
/**
 * Parse narration in `text` and execute any extracted file writes. Returns the
 * number of files actually written. No-ops (returns 0) when there is no
 * executor or no parseable actions.
 */
export declare function executeProseActions(text: string, deps: ExecuteProseDeps): Promise<number>;
//# sourceMappingURL=file-write-fallback.d.ts.map