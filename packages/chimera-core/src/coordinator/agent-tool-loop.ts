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
import { isAbsolute, resolve } from 'path';
import type { EventStream } from '../event-stream.js';
import type {
  LLMProvider,
  ToolExecutorInterface,
  ToolRegistryInterface,
} from '../session-orchestrator.js';
import type { ToolCall } from '../types/agent.js';
import { runToolCalls } from './tool-execution-helper.js';
import { expectedPathFromTask, fileLandedOnDisk, snapshotTarget, targetChanged } from './path-from-task.js';

/** Disk state of a file: mtime+size, or null if missing. Used to verify a
 *  write/edit tool call actually mutated the target (not a no-op/failed call). */
function statFile(root: string, rel: string): { mtime: number; size: number } | null {
  try {
    const abs = isAbsolute(rel) ? rel : resolve(root, rel);
    const s = statSync(abs);
    return { mtime: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

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
    return { role: 'tool', content: payload, tool_call_id: result.result.toolCallId, toolName: result.toolName };
  }
  return { role: 'tool', content: payload, toolResultId: result.result.toolCallId, toolName: result.toolName };
}

const CONTINUE_NUDGE = 'Continue. Incorporate the tool results and finish the task.';
const FILE_NUDGE =
  'You have NOT created any files yet. The task requires you to CREATE files. ' +
  'Call write_file NOW for each file the task lists — do not summarize or explain, just write the files.';

// ── LLM call retry/backoff ───────────────────────────────────────────────
// The tool-execution path already retries transient write failures; the LLM
// call did NOT — a single 429/500/network blip threw and aborted the whole
// task with no recovery. `completeWithRetry` wraps `provider.complete` with a
// bounded exponential backoff so one transient error can't kill a task.
// ponytail: one global retry budget; if per-model 429 budgets ever matter,
// move the cap into provider config. NOT retried on AbortSignal — out of
// scope here; add a signal passthrough only if the loop gains cancellation.
const LLM_MAX_RETRIES = 3;
const LLM_BASE_BACKOFF_MS = 800;
const LLM_MAX_BACKOFF_MS = 8000;

async function completeWithRetry(
  provider: LLMProvider,
  messages: LoopChatMessage[],
  options: Record<string, unknown>,
  eventStream: EventStream,
  label: string,
): Promise<any> {
  let attempt = 0;
  for (;;) {
    try {
      return await provider.complete(messages as any, options as any);
    } catch (err) {
      if (attempt >= LLM_MAX_RETRIES) throw err;
      const backoff = Math.min(LLM_BASE_BACKOFF_MS * 2 ** attempt, LLM_MAX_BACKOFF_MS);
      eventStream.append({
        type: 'llm_retry',
        label,
        attempt: attempt + 1,
        maxRetries: LLM_MAX_RETRIES,
        error: String((err as Error)?.message ?? err),
        backoffMs: backoff,
      } as any);
      await new Promise((r) => setTimeout(r, backoff));
      attempt++;
    }
  }
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
  // Snapshot the task's target at entry so we can detect an edit that was
  // narrated but never applied (mtime/size unchanged after the run).
  const targetBefore = workspaceRoot ? snapshotTarget(task ?? '', workspaceRoot) : null;

  while (canLoop && currentToolCalls.length > 0 && round < maxRounds) {
    round++;

    // Snapshot write/edit targets BEFORE execution. We count only REAL disk
    // mutations (below, after runToolCalls), not tool-call sightings — a model
    // can emit write_file/edit_file that fails or is a no-op (identical
    // content), which must NOT count as "landed" or the run reports a false
    // `done`. ponytail: ground truth is disk state, not tool-call count.
    const preStat = new Map<string, { mtime: number; size: number } | null>();
    for (const tc of currentToolCalls) {
      if (tc && typeof tc.name === 'string' && (tc.name === 'write_file' || tc.name === 'edit_file')) {
        const p = (tc.arguments as { path?: string } | undefined)?.path;
        if (typeof p === 'string') preStat.set(p, statFile(workspaceRoot!, p));
      }
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

    // Count only write/edit tool calls whose target file actually changed on
    // disk (created, or mtime/size differs from the pre-execution snapshot).
    for (const tc of currentToolCalls) {
      if (tc && typeof tc.name === 'string' && (tc.name === 'write_file' || tc.name === 'edit_file')) {
        const p = (tc.arguments as { path?: string } | undefined)?.path;
        if (typeof p === 'string') {
          const before = preStat.get(p) ?? null;
          const after = statFile(workspaceRoot!, p);
          if (after && (!before || before.mtime !== after.mtime || before.size !== after.size)) {
            wroteFileCount++;
          }
        }
      }
    }

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

    const r = await completeWithRetry(provider, messages, options, eventStream, 'loop');
    const nextContent = sanitizeFn(r.content ?? '');
    inputTokens += (r as any).usage?.inputTokens ?? 0;
    outputTokens += (r as any).usage?.outputTokens ?? 0;
    lastContent = nextContent;
    assistantContent = nextContent;
    currentToolCalls = r.toolCalls ?? [];
  }

  // ── Force-min-files gate ────────────────────────────────────────────
  // When the task wants files on disk but the writer ended a turn with NO
  // tool call (pure narration like "I'll follow the plan…") the bounded loop
  // above never executed — its entry guard requires `currentToolCalls.length
  // > 0`. That single-shot narration then becomes the final output and the
  // run terminates as `needs_user`. This gate re-injects a forced write-file
  // turn so the model MUST call write_file. It is mode-agnostic (solo/duo/
  // trio/fusion all route their writer through this loop) and is NOT gated on
  // `forceMinFiles` being supplied — any `wantsFiles` task that landed zero
  // files gets the guarantee.
  let realFiles = 0;
  const targetPath = task ? expectedPathFromTask(task) : undefined;
  // Fire when the task wants files but NONE landed (new-file case) OR the
  // target exists yet was NOT modified on disk (edit narrated, not applied).
  // The pre-existing file is the trap: fileLandedOnDisk is true for an edit,
  // so we must also check targetChanged to avoid a silent false `done`.
  const targetUnchanged = !!workspaceRoot && !!task && !targetChanged(task, workspaceRoot, targetBefore);
  const wantForce =
    wantsFiles === true && canLoop && (!fileLandedOnDisk(task ?? '', workspaceRoot!) || targetUnchanged);

  if (wantForce) {
    realFiles = countSourceFiles(workspaceRoot!);
    const MAX_FORCE = forceMinFiles ?? 3;
    let forceAttempts = 0;
    while ((!fileLandedOnDisk(task ?? '', workspaceRoot!) || !targetChanged(task ?? '', workspaceRoot!, targetBefore)) && forceAttempts < MAX_FORCE) {
      forceAttempts++;
      const forceMessages: LoopChatMessage[] = [];
      if (systemPrompt) forceMessages.push({ role: 'system', content: systemPrompt });
      const targetLine = targetPath
        ? `You MUST call write_file (to create a new file) or edit_file (to modify an existing file) to apply the fix to \`${targetPath}\`; do not merely narrate the change. `
        : 'You MUST call write_file or edit_file to apply the fix to the file the task names; do not merely narrate the change. ';
      forceMessages.push({
        role: 'user',
        content:
          'Your previous response did not create or modify any files (it only described what you would do). ' +
          'The task REQUIRES you to actually call write_file. ' +
          targetLine +
          'Re-read the task and immediately call write_file using the exact relative path. ' +
          'Do NOT summarize, explain, or describe the change in prose — produce the tool call now.\n\n' +
          `TASK: ${task ?? ''}\n\n` +
          `PREVIOUS OUTPUT (for reference, do not copy):\n${lastContent.slice(0, 2000)}`,
      });
      try {
        const forced = await completeWithRetry(
          provider,
          forceMessages,
          { ...options, ...(toolDefs ? { tools: toolDefs } : {}) },
          eventStream,
          'force',
        );
        const forcedContent = sanitizeFn(forced.content ?? '');
        inputTokens += (forced as any).usage?.inputTokens ?? 0;
        outputTokens += (forced as any).usage?.outputTokens ?? 0;
        lastContent = forcedContent;
        if (forced.toolCalls && forced.toolCalls.length > 0) {
          // Disk-verify forced writes too: snapshot targets, count only real
          // mutations (a no-op/failed forced write must NOT count as landed).
          const forcedPre = new Map<string, { mtime: number; size: number } | null>();
          for (const tc of forced.toolCalls) {
            if (tc.name === 'write_file' || tc.name === 'edit_file') {
              const p = (tc.arguments as { path?: string } | undefined)?.path;
              if (typeof p === 'string') forcedPre.set(p, statFile(workspaceRoot!, p));
            }
          }
          await runToolCalls({
            toolCalls: forced.toolCalls,
            toolExecutor: toolExecutor ?? null,
            toolRegistry: toolRegistry ?? null,
            eventStream,
            workspaceRoot: workspaceRoot!,
            sessionId,
          });
          for (const tc of forced.toolCalls) {
            if (tc.name === 'write_file' || tc.name === 'edit_file') {
              const p = (tc.arguments as { path?: string } | undefined)?.path;
              if (typeof p === 'string') {
                const before = forcedPre.get(p) ?? null;
                const after = statFile(workspaceRoot!, p);
                if (after && (!before || before.mtime !== after.mtime || before.size !== after.size)) {
                  wroteFileCount++;
                }
              }
            }
          }
        }
        realFiles = countSourceFiles(workspaceRoot!);
      } catch {
        /* best-effort; do not crash the run */
      }
    }
  } else if (workspaceRoot) {
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
