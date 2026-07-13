/**
 * Shared, single-source `expectedPathFromTask` — previously duplicated verbatim
 * in solo/trio/fusion executors and the sub-agent spawner. Per the project's
 * golden rule (no duplication), the regex lives here once and every caller
 * imports it.
 *
 * Best-effort extraction of a single target filename from a task string, so a
 * bare fenced code block can be written to the file the user asked for.
 */
export declare function expectedPathFromTask(task: string): string | undefined;
/**
 * Single source of truth for "does this task want a file written to disk?"
 * Previously each executor re-derived this with a slightly different regex,
 * and every copy only matched a *trailing* file extension — so a debug task
 * like "fix the bug in bug.js" (file named mid-sentence, no create/write
 * verb) was misclassified as non-file, the prose-fallback never ran, and the
 * model narrated the fix instead of editing. Now: a verb OR a named file
 * anywhere in the task OR a known source-tree path all count.
 */
export declare function taskWantsFiles(task: string): boolean;
/**
 * Ground-truth check: did the task's expected output file actually land on
 * disk? Used to gate the prose-fallback so it runs whenever the file is
 * MISSING — not when the writer merely *emitted* a (possibly failed) write
 * tool call. Fixes the false-skip: `wroteFileCount` increments on emit before
 * execution (agent-tool-loop.ts), so a call that didn't persist would
 * wrongly suppress the prose safety-net.
 */
export declare function fileLandedOnDisk(task: string, workspaceRoot: string): boolean;
//# sourceMappingURL=path-from-task.d.ts.map