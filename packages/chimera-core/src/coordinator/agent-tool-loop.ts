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

import { existsSync, readdirSync, statSync } from 'fs';
import type { EventStream } from '../event-stream.js';
import type {
  LLMProvider,
  ToolExecutorInterface,
  ToolRegistryInterface,
} from '../session-orchestrator.js';
import type { ToolCall } from '../types/agent.js';
import { runToolCalls } from './tool-execution-helper.js';

/** Loose chat message shape — callers append richer fields per `mode`. */
export interface LoopChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Solo-style tool calls (kept on the assistant message). */
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** Trio/spawner-style tool calls. */
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  /** Solo-style tool result linkage. */
  toolResultId?: string;
  /** Trio/spawner-style tool result linkage. */
  tool_call_id?: string;
}

/**
 * Count real source files on disk under `dir` (skips build/cache dirs).
 * Used by the completion gate so we assert ground truth, not tool-call counts.
 * Hoisted here from solo-executor so the shared loop owns the gate logic.
 */
export function countSourceFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'target' || entry === 'node_modules' || entry === '.git' ||
      entry === '.chimera' || entry.startsWith('.')
    ) continue;
    const full = `${dir}/${entry}`;
    try {
      if (statSync(full).isDirectory()) n += countSourceFiles(full);
      else if (/\.(rs|ts|toml|json|md|ya?ml|lock)$/i.test(entry)) n++;
    } catch {
      /* ignore unreadable */
    }
  }
  return n;
}

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
  // ── Force-min-files gate (solo only) ──
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
  toolDefs?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
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

// ── Per-mode message assembly ──────────────────────────────────────────────

function assistantMessage(
  mode: AgentToolLoopMode,
  content: string,
  toolCalls: ToolCall[],
): LoopChatMessage {
  if (mode === 'trio') {
    return {
      role: 'assistant',
      content,
      tool_calls: toolCalls
        .filter((tc) => tc && typeof tc.name === 'string')
        .map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
    };
  }
  // solo / spawner: string-arg tool calls under `toolCalls`
  return {
    role: 'assistant',
    content,
    toolCalls: toolCalls
      .filter((tc) => tc && typeof tc.name === 'string')
      .map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
      })),
  };
}

function toolResultMessage(
  mode: AgentToolLoopMode,
  result: { toolName: string; args: Record<string, unknown>; result: import('../types/agent.js').ToolCallResult },
): LoopChatMessage {
  const payload = JSON.stringify(result.result.result);
  if (mode === 'trio') {
    return { role: 'tool', content: payload, tool_call_id: result.result.toolCallId };
  }
  return { role: 'tool', content: payload, toolResultId: result.result.toolCallId };
}

const CONTINUE_NUDGE = 'Continue. Incorporate the tool results and finish the task.';
const FILE_NUDGE =
  'You have NOT created any files yet. The task requires you to CREATE files. ' +
  'Call write_file NOW for each file the task lists — do not summarize or explain, just write the files.';

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
export async function runAgentToolLoop(
  params: RunAgentToolLoopParams,
): Promise<RunAgentToolLoopResult> {
  const {
    provider,
    messages: seedMessages,
    options,
    toolExecutor,
    toolRegistry,
    eventStream,
    workspaceRoot,
    sessionId,
    initialContent,
    initialToolCalls,
    maxRounds,
    mode = 'solo',
    forceMinFiles,
    wantsFiles,
    task,
    systemPrompt,
    toolDefs,
    sanitize,
  } = params;

  const sanitizeFn = sanitize ?? ((s: string) => s);
  const messages: LoopChatMessage[] = seedMessages.map((m) => ({ ...m }));

  let currentToolCalls: ToolCall[] = initialToolCalls ?? [];
  let assistantContent = initialContent;
  let lastContent = initialContent;
  let round = 0;
  let wroteFileCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const canLoop = !!toolExecutor && !!workspaceRoot;

  while (canLoop && currentToolCalls.length > 0 && round < maxRounds) {
    round++;
    for (const tc of currentToolCalls) {
      if (tc && typeof tc.name === 'string' && tc.name === 'write_file') wroteFileCount++;
    }

    messages.push(assistantMessage(mode, assistantContent, currentToolCalls));

    const toolResults = await runToolCalls({
      toolCalls: currentToolCalls,
      toolExecutor: toolExecutor ?? null,
      toolRegistry: toolRegistry ?? null,
      eventStream,
      workspaceRoot: workspaceRoot!,
      sessionId,
    });

    for (const tr of toolResults) messages.push(toolResultMessage(mode, tr));

    // Surface persistent write failures (after runToolCalls' single retry) on
    // the event stream instead of only burying them in the tool-result
    // transcript — so `writeErrors` are observable to the caller/matrix.
    for (const tr of toolResults) {
      if (!tr.result.result.success && /write|edit|create/.test(tr.toolName)) {
        eventStream.append({
          type: 'tool_call_failed',
          tool: tr.toolName,
          error: tr.result.result.error ?? 'write failed',
        } as any);
      }
    }

    const nudge = mode === 'trio'
      ? CONTINUE_NUDGE
      : (wroteFileCount === 0 ? FILE_NUDGE : CONTINUE_NUDGE);
    messages.push({ role: 'user', content: nudge });

    const r = await provider.complete(messages as any, options as any);
    const nextContent = sanitizeFn(r.content ?? '');
    inputTokens += (r as any).usage?.inputTokens ?? 0;
    outputTokens += (r as any).usage?.outputTokens ?? 0;
    lastContent = nextContent;
    assistantContent = nextContent;
    currentToolCalls = r.toolCalls ?? [];
  }

  // ── Force-min-files gate (solo only) ──────────────────────────────────
  let realFiles = 0;
  const wantForce =
    mode === 'solo' && forceMinFiles !== undefined && wantsFiles === true && canLoop;

  if (wantForce) {
    realFiles = countSourceFiles(workspaceRoot!);
    let forceAttempts = 0;
    const MAX_FORCE = 3;
    while (realFiles < (forceMinFiles as number) && forceAttempts < MAX_FORCE) {
      forceAttempts++;
      const forceMessages: LoopChatMessage[] = [];
      if (systemPrompt) forceMessages.push({ role: 'system', content: systemPrompt });
      forceMessages.push({
        role: 'user',
        content:
          'Your previous response did not create any files. The task REQUIRES you to create files on disk. ' +
          'Re-read the task and immediately call write_file for EVERY file it lists, using the exact relative paths. ' +
          `Do not describe or summarize — produce the tool calls now.\n\nTASK: ${task ?? ''}\n\n` +
          `PREVIOUS OUTPUT (for reference, do not copy):\n${lastContent.slice(0, 2000)}`,
      });
      try {
        const forced = await provider.complete(
          forceMessages as any,
          { ...options, ...(toolDefs ? { tools: toolDefs } : {}) } as any,
        );
        const forcedContent = sanitizeFn(forced.content ?? '');
        inputTokens += (forced as any).usage?.inputTokens ?? 0;
        outputTokens += (forced as any).usage?.outputTokens ?? 0;
        lastContent = forcedContent;
        if (forced.toolCalls && forced.toolCalls.length > 0) {
          for (const tc of forced.toolCalls) {
            if (tc.name === 'write_file') wroteFileCount++;
          }
          await runToolCalls({
            toolCalls: forced.toolCalls,
            toolExecutor: toolExecutor ?? null,
            toolRegistry: toolRegistry ?? null,
            eventStream,
            workspaceRoot: workspaceRoot!,
            sessionId,
          });
        }
        realFiles = countSourceFiles(workspaceRoot!);
      } catch {
        /* best-effort; do not crash the run */
      }
    }
  } else if (mode === 'solo' && workspaceRoot) {
    realFiles = countSourceFiles(workspaceRoot);
  }

  return {
    content: lastContent,
    toolCalls: currentToolCalls,
    messages,
    round,
    wroteFileCount,
    realFiles,
    inputTokens,
    outputTokens,
  };
}
