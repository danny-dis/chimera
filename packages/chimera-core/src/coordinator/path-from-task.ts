/**
 * Shared, single-source `expectedPathFromTask` — previously duplicated verbatim
 * in solo/trio/fusion executors and the sub-agent spawner. Per the project's
 * golden rule (no duplication), the regex lives here once and every caller
 * imports it.
 *
 * Best-effort extraction of a single target filename from a task string, so a
 * bare fenced code block can be written to the file the user asked for.
 */
export function expectedPathFromTask(task: string): string | undefined {
  const m = task.match(/\b([A-Za-z0-9_\-./]+\.(?:rs|ts|js|jsx|tsx|py|toml|json|md|ya?ml|go|java|cpp|c|rb|php|txt|html|css|sh))\b/);
  return m ? m[1] : undefined;
}

/**
 * Single source of truth for "does this task want a file written to disk?"
 * Previously each executor re-derived this with a slightly different regex,
 * and every copy only matched a *trailing* file extension — so a debug task
 * like "fix the bug in bug.js" (file named mid-sentence, no create/write
 * verb) was misclassified as non-file, the prose-fallback never ran, and the
 * model narrated the fix instead of editing. Now: a verb OR a named file
 * anywhere in the task OR a known source-tree path all count.
 */
export function taskWantsFiles(task: string): boolean {
  if (/\b(create|scaffold|write|generate|build|implement|make|port|add|fix|correct|patch|edit|repair|refactor)\b/i.test(task)) return true;
  // Named file anywhere in the task (mid-sentence or trailing) — covers debug.
  if (expectedPathFromTask(task)) return true;
  if (/Cargo\.toml|src[\\/]|\b(src|lib|app|components|tests?)\b[\\/]/i.test(task)) return true;
  return false;
}

import { existsSync, statSync } from 'fs';
import { isAbsolute, resolve } from 'path';

/**
 * Ground-truth check: did the task's expected output file actually land on
 * disk? Used to gate the prose-fallback so it runs whenever the file is
 * MISSING — not when the writer merely *emitted* a (possibly failed) write
 * tool call. Fixes the false-skip: `wroteFileCount` increments on emit before
 * execution (agent-tool-loop.ts), so a call that didn't persist would
 * wrongly suppress the prose safety-net.
 */
export function fileLandedOnDisk(task: string, workspaceRoot: string): boolean {
  const rel = expectedPathFromTask(task);
  if (!rel) return false;
  const abs = isAbsolute(rel) ? rel : resolve(workspaceRoot, rel);
  return existsSync(abs);
}

/**
 * Stat of the task's expected target file at run start. null = file missing
 * (new-file task) or no target extractable. Used to detect real mutations:
 * a task that EDITs an existing file must change its mtime/size, not merely
 * leave the pre-existing file in place (which `fileLandedOnDisk` falsely
 * reports as "landed").
 */
export function snapshotTarget(task: string, workspaceRoot: string): { mtime: number; size: number } | null {
  const rel = expectedPathFromTask(task);
  if (!rel) return null;
  const abs = isAbsolute(rel) ? rel : resolve(workspaceRoot, rel);
  try {
    const s = statSync(abs);
    return { mtime: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

/**
 * Did the task's target file actually change on disk vs `before` (a snapshot
 * taken at run start)? Handles three cases: new file created (before=null,
 * after exists), existing file modified (mtime/size differ), deleted
 * (before set, after missing). This is the correct completion gate for BOTH
 * new-file and edit tasks — unlike `fileLandedOnDisk`, which is always true
 * for an edit of a pre-existing file and thus yields a false `done`.
 */
export function targetChanged(task: string, workspaceRoot: string, before: { mtime: number; size: number } | null): boolean {
  const after = snapshotTarget(task, workspaceRoot);
  if (before === null) return after !== null;
  if (after === null) return false;
  return before.mtime !== after.mtime || before.size !== after.size;
}
