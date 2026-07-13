"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.countSourceFiles = countSourceFiles;
exports.runAgentToolLoop = runAgentToolLoop;
const fs_1 = require("fs");
const path_1 = require("path");
const tool_execution_helper_js_1 = require("./tool-execution-helper.js");
const path_from_task_js_1 = require("./path-from-task.js");
/** Disk state of a file: mtime+size, or null if missing. Used to verify a
 *  write/edit tool call actually mutated the target (not a no-op/failed call). */
function statFile(root, rel) {
    try {
        const abs = (0, path_1.isAbsolute)(rel) ? rel : (0, path_1.resolve)(root, rel);
        const s = (0, fs_1.statSync)(abs);
        return { mtime: s.mtimeMs, size: s.size };
    }
    catch {
        return null;
    }
}
/**
 * Count real source files on disk under `dir` (skips build/cache dirs).
 * Used by the completion gate so we assert ground truth, not tool-call counts.
 * Hoisted here from solo-executor so the shared loop owns the gate logic.
 */
function countSourceFiles(dir) {
    if (!(0, fs_1.existsSync)(dir))
        return 0;
    let n = 0;
    for (const entry of (0, fs_1.readdirSync)(dir)) {
        if (entry === 'target' || entry === 'node_modules' || entry === '.git' ||
            entry === '.chimera' || entry.startsWith('.'))
            continue;
        const full = `${dir}/${entry}`;
        try {
            if ((0, fs_1.statSync)(full).isDirectory())
                n += countSourceFiles(full);
            else if (/\.(rs|ts|toml|json|md|ya?ml|lock)$/i.test(entry))
                n++;
        }
        catch {
            /* ignore unreadable */
        }
    }
    return n;
}
// ── Per-mode message assembly ──────────────────────────────────────────────
function assistantMessage(mode, content, toolCalls) {
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
function toolResultMessage(mode, result) {
    const payload = JSON.stringify(result.result.result);
    if (mode === 'trio') {
        return { role: 'tool', content: payload, tool_call_id: result.result.toolCallId };
    }
    return { role: 'tool', content: payload, toolResultId: result.result.toolCallId };
}
const CONTINUE_NUDGE = 'Continue. Incorporate the tool results and finish the task.';
const FILE_NUDGE = 'You have NOT created any files yet. The task requires you to CREATE files. ' +
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
async function runAgentToolLoop(params) {
    const { provider, messages: seedMessages, options, toolExecutor, toolRegistry, eventStream, workspaceRoot, sessionId, initialContent, initialToolCalls, maxRounds, mode = 'solo', forceMinFiles, wantsFiles, task, systemPrompt, toolDefs, sanitize, } = params;
    const sanitizeFn = sanitize ?? ((s) => s);
    const messages = seedMessages.map((m) => ({ ...m }));
    let currentToolCalls = initialToolCalls ?? [];
    let assistantContent = initialContent;
    let lastContent = initialContent;
    let round = 0;
    let wroteFileCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const canLoop = !!toolExecutor && !!workspaceRoot;
    while (canLoop && currentToolCalls.length > 0 && round < maxRounds) {
        round++;
        // Snapshot write/edit targets BEFORE execution. We count only REAL disk
        // mutations (below, after runToolCalls), not tool-call sightings — a model
        // can emit write_file/edit_file that fails or is a no-op (identical
        // content), which must NOT count as "landed" or the run reports a false
        // `done`. ponytail: ground truth is disk state, not tool-call count.
        const preStat = new Map();
        for (const tc of currentToolCalls) {
            if (tc && typeof tc.name === 'string' && (tc.name === 'write_file' || tc.name === 'edit_file')) {
                const p = tc.arguments?.path;
                if (typeof p === 'string')
                    preStat.set(p, statFile(workspaceRoot, p));
            }
        }
        messages.push(assistantMessage(mode, assistantContent, currentToolCalls));
        const toolResults = await (0, tool_execution_helper_js_1.runToolCalls)({
            toolCalls: currentToolCalls,
            toolExecutor: toolExecutor ?? null,
            toolRegistry: toolRegistry ?? null,
            eventStream,
            workspaceRoot: workspaceRoot,
            sessionId,
        });
        for (const tr of toolResults)
            messages.push(toolResultMessage(mode, tr));
        // Count only write/edit tool calls whose target file actually changed on
        // disk (created, or mtime/size differs from the pre-execution snapshot).
        for (const tc of currentToolCalls) {
            if (tc && typeof tc.name === 'string' && (tc.name === 'write_file' || tc.name === 'edit_file')) {
                const p = tc.arguments?.path;
                if (typeof p === 'string') {
                    const before = preStat.get(p) ?? null;
                    const after = statFile(workspaceRoot, p);
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
                });
            }
        }
        const nudge = mode === 'trio'
            ? CONTINUE_NUDGE
            : (wroteFileCount === 0 ? FILE_NUDGE : CONTINUE_NUDGE);
        messages.push({ role: 'user', content: nudge });
        const r = await provider.complete(messages, options);
        const nextContent = sanitizeFn(r.content ?? '');
        inputTokens += r.usage?.inputTokens ?? 0;
        outputTokens += r.usage?.outputTokens ?? 0;
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
    const targetPath = task ? (0, path_from_task_js_1.expectedPathFromTask)(task) : undefined;
    const wantForce = wantsFiles === true && !(0, path_from_task_js_1.fileLandedOnDisk)(task ?? '', workspaceRoot) && canLoop;
    if (wantForce) {
        realFiles = countSourceFiles(workspaceRoot);
        const MAX_FORCE = forceMinFiles ?? 3;
        let forceAttempts = 0;
        while (!(0, path_from_task_js_1.fileLandedOnDisk)(task ?? '', workspaceRoot) && forceAttempts < MAX_FORCE) {
            forceAttempts++;
            const forceMessages = [];
            if (systemPrompt)
                forceMessages.push({ role: 'system', content: systemPrompt });
            const targetLine = targetPath
                ? `You MUST call write_file to apply the fix to \`${targetPath}\`; do not merely narrate the change. `
                : 'You MUST call write_file to apply the fix to the file the task names; do not merely narrate the change. ';
            forceMessages.push({
                role: 'user',
                content: 'Your previous response did not create or modify any files (it only described what you would do). ' +
                    'The task REQUIRES you to actually call write_file. ' +
                    targetLine +
                    'Re-read the task and immediately call write_file using the exact relative path. ' +
                    'Do NOT summarize, explain, or describe the change in prose — produce the tool call now.\n\n' +
                    `TASK: ${task ?? ''}\n\n` +
                    `PREVIOUS OUTPUT (for reference, do not copy):\n${lastContent.slice(0, 2000)}`,
            });
            try {
                const forced = await provider.complete(forceMessages, { ...options, ...(toolDefs ? { tools: toolDefs } : {}) });
                const forcedContent = sanitizeFn(forced.content ?? '');
                inputTokens += forced.usage?.inputTokens ?? 0;
                outputTokens += forced.usage?.outputTokens ?? 0;
                lastContent = forcedContent;
                if (forced.toolCalls && forced.toolCalls.length > 0) {
                    // Disk-verify forced writes too: snapshot targets, count only real
                    // mutations (a no-op/failed forced write must NOT count as landed).
                    const forcedPre = new Map();
                    for (const tc of forced.toolCalls) {
                        if (tc.name === 'write_file' || tc.name === 'edit_file') {
                            const p = tc.arguments?.path;
                            if (typeof p === 'string')
                                forcedPre.set(p, statFile(workspaceRoot, p));
                        }
                    }
                    await (0, tool_execution_helper_js_1.runToolCalls)({
                        toolCalls: forced.toolCalls,
                        toolExecutor: toolExecutor ?? null,
                        toolRegistry: toolRegistry ?? null,
                        eventStream,
                        workspaceRoot: workspaceRoot,
                        sessionId,
                    });
                    for (const tc of forced.toolCalls) {
                        if (tc.name === 'write_file' || tc.name === 'edit_file') {
                            const p = tc.arguments?.path;
                            if (typeof p === 'string') {
                                const before = forcedPre.get(p) ?? null;
                                const after = statFile(workspaceRoot, p);
                                if (after && (!before || before.mtime !== after.mtime || before.size !== after.size)) {
                                    wroteFileCount++;
                                }
                            }
                        }
                    }
                }
                realFiles = countSourceFiles(workspaceRoot);
            }
            catch {
                /* best-effort; do not crash the run */
            }
        }
    }
    else if (workspaceRoot) {
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
//# sourceMappingURL=agent-tool-loop.js.map