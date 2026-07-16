/**
 * `runAgentToolLoop` — the single shared "call LLM → execute tool_calls →
 * feed results back → repeat" bounded loop, extracted from the three formerly
 * duplicated agent loops (solo-executor, trio-executor, sub-agent-spawner).
 *
 * This is the project golden-rule de-duplication: the loop mechanics
 * (provider.complete → runToolCalls → append results → re-call) now live in
 * exactly one place. The only behavioral differences between the callers are
 * the message shapes they expect and whether they run a "force minimum files"
 * gate; those are captured by the `mode` flag and the optional `forceMinFiles`
 * / `wantsFiles` knobs, NOT by copy-pasted loops.
 *
 * Determinism / scope:
 *   - No new LLM calls beyond the bounded loop + optional force-write gate.
 *   - `runToolCalls` (tool-execution-helper.ts) does the real tool side
 *     effects; this helper only orchestrates the conversation.
 *   - Behaviour-preserving: given the same inputs, solo/trio produce byte-for-
 *     byte the same token usage, message sequences, and on-disk outcomes as
 *     before the refactor.
 */
import type { EventStream } from '../event-stream.js';
import type { LLMProvider, ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { ToolCall } from '../types/agent.js';
/** Loose chat message shape — callers append richer fields per `mode`. */
export interface LoopChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    /** Solo-style tool calls (kept on the assistant message). */
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: string;
    }>;
    /** Trio/spawner-style tool calls. */
    tool_calls?: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
    /** Solo-style tool result linkage. */
    toolResultId?: string;
    /** Tool name for the result (needed by strict providers e.g. Google). */
    toolName?: string;
    /** Trio/spawner-style tool result linkage. */
    tool_call_id?: string;
}
/**
 * Count real source files on disk under `dir` (skips build/cache dirs).
 * Used by the completion gate so we assert ground truth, not tool-call counts.
 * Hoisted here from solo-executor so the shared loop owns the gate logic.
 */
export declare function countSourceFiles(dir: string): number;
export type AgentToolLoopMode = 'solo' | 'trio';
export interface RunAgentToolLoopParams {
    /** Provider used for every completion call in the loop. */
    provider: LLMProvider;
    /**
     * Seed conversation. For solo this is `[system?]` (the follow-up round
     * starts from the assistant tool message, not the original prompt). For
     * trio this is `[user]` (the draft prompt is carried into the follow-up).
     * The helper appends to a copy and returns the full transcript.
     */
    messages: LoopChatMessage[];
    /** Completion options forwarded to `provider.complete` on every round. */
    options: Record<string, unknown>;
    toolExecutor: ToolExecutorInterface | null | undefined;
    toolRegistry: ToolRegistryInterface | null | undefined;
    eventStream: EventStream;
    workspaceRoot: string | undefined;
    sessionId: string;
    /** Content of the response that produced `initialToolCalls`. */
    initialContent: string;
    /** Tool calls from the most recent response (the loop driver). */
    initialToolCalls: ToolCall[];
    /** Max loop iterations (solo: maxDepth, trio: 1, spawner: 3). */
    maxRounds: number;
    mode?: AgentToolLoopMode;
    /**
     * If `mode === 'solo'` and `wantsFiles` and the loop ran, after the loop we
     * count real source files on disk. While below `forceMinFiles` we issue extra
     * write-file turns (up to 3) and re-check. Mirrors solo's FORCE_MIN_FILES gate.
     */
    forceMinFiles?: number;
    wantsFiles?: boolean;
    /** Task text — only needed for the force-write nudge. */
    task?: string;
    /** System prompt — only needed for the force-write turn. */
    systemPrompt?: string;
    /** Tool definitions — passed to the force-write turn so the model can call write_file. */
    toolDefs?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
    /** Optional content sanitizer applied to follow-up / force content (solo: sanitizeWriterOutput). */
    sanitize?: (s: string) => string;
}
export interface RunAgentToolLoopResult {
    /** Content of the final response (last follow-up / force turn). */
    content: string;
    /** Tool calls emitted by the final response (empty when the loop terminated cleanly). */
    toolCalls: ToolCall[];
    /** Full transcript including appended assistant/tool/nudge messages. */
    messages: LoopChatMessage[];
    /** Number of loop iterations that ran (0 if no tool calls to start with). */
    round: number;
    /** Count of `write_file` calls seen across the loop + force gate. */
    wroteFileCount: number;
    /** Real source files on disk after the loop (and force gate, if any). */
    realFiles: number;
    /**
     * Prompt tokens summed across every `provider.complete` call this helper
     * made (loop follow-ups + force turns). Callers fold this into their own
     * running totals and compute cost once — numerically identical to the
     * per-round accounting the inline loops used, since cost is linear in tokens.
     */
    inputTokens: number;
    /** Completion tokens summed across every `provider.complete` call. */
    outputTokens: number;
}
/**
 * Run the shared bounded tool loop.
 *
 * Loop: while the last response had tool calls, the executor is wired, and we
 * are under `maxRounds`:
 *   1. push the assistant message (with its tool_calls) onto the transcript,
 *   2. execute the calls via `runToolCalls`,
 *   3. push each tool result message,
 *   4. push a nudge user message (escalating to file-creation for solo when no
 *      files have landed yet),
 *   5. call `provider.complete` and capture the next response.
 *
 * After the loop, when `mode === 'solo'` and `wantsFiles`, run the
 * FORCE_MIN_FILES gate: count real source files on disk and, while below
 * `forceMinFiles`, issue explicit write-file turns and re-check.
 */
export declare function runAgentToolLoop(params: RunAgentToolLoopParams): Promise<RunAgentToolLoopResult>;
//# sourceMappingURL=agent-tool-loop.d.ts.map