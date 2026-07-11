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
import { runToolCalls } from './tool-execution-helper.js';
import type { ToolCall } from '../types/agent.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';

function extractFencedCode(block: string): string {
  const fence = block.match(/```(?:[\w-]*)\n([\s\S]*?)```/);
  if (fence) return fence[1].replace(/\s+$/, '');
  // No fence: return the trimmed content as-is (best effort).
  return block.trim();
}

function splitEditBlock(block: string): { old_string: string; new_string: string } {
  const oldM = block.match(/OLD:\s*\n?```(?:[\w-]*)\n([\s\S]*?)```/i);
  const newM = block.match(/NEW:\s*\n?```(?:[\w-]*)\n([\s\S]*?)```/i);
  return {
    old_string: oldM ? oldM[1].replace(/\s+$/, '') : '',
    new_string: newM ? newM[1].replace(/\s+$/, '') : extractFencedCode(block),
  };
}

/**
 * Parse writer prose into file-operation tool calls.
 * Handles three common narration shapes:
 *   1) `### ACTION: WRITE <path>` + fenced code block
 *   2) `### ACTION: EDIT <path>` + OLD:/NEW: fenced blocks
 *   3) `**DELTA:** <path>[:lines]` + fenced code block
 *   4) `write_file("<path>")` / `File: <path>` followed by a fenced block
 */
export function parseProseActions(text: string, expectedPath?: string): ToolCall[] {
  const calls: ToolCall[] = [];
  if (!text) return calls;
  let n = 0;
  const mkId = () => `prose-${Date.now().toString(36)}-${n++}`;

  // 1 + 2) ### ACTION: WRITE|EDIT <path>
  const actionRe = /###\s*ACTION:\s*(WRITE|EDIT)\s+(\S+)\s*\n([\s\S]*?)(?=\n###\s*ACTION:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(text))) {
    const op = m[1].toUpperCase();
    const path = m[2].trim();
    if (op === 'WRITE') {
      const content = extractFencedCode(m[3]);
      if (content) calls.push({ id: mkId(), name: 'write_file', arguments: { path, content } });
    } else {
      const { old_string, new_string } = splitEditBlock(m[3]);
      if (new_string) calls.push({ id: mkId(), name: 'edit_file', arguments: { path, old_string, new_string } });
    }
  }

  // 3) **DELTA:** <path>[:lines]  (line range like :1-4 must be stripped)
  const deltaRe = /\*\*DELTA:\*\*\s*(\S+?)(?::[\d,\-]+)?\s*\n([\s\S]*?)(?=\n\*\*DELTA:\*\*|$)/gi;
  while ((m = deltaRe.exec(text))) {
    const path = m[1].trim().replace(/:[\d,\-]+$/, '');
    const content = extractFencedCode(m[2]);
    if (path && content) calls.push({ id: mkId(), name: 'write_file', arguments: { path, content } });
  }

  // 4) write_file("<path>") / File: <path> + fenced block
  const genRe = /(?:write_file\(\s*["']([^"']+)["']\s*\)|File:\s*(\S+))\s*\n```(?:[\w-]*)\n([\s\S]*?)```/gi;
  while ((m = genRe.exec(text))) {
    const path = (m[1] || m[2]).trim();
    const content = m[3];
    if (path && content) calls.push({ id: mkId(), name: 'write_file', arguments: { path, content } });
  }

  // 4b) Inline prose that names a file then shows a fenced block, e.g.
  //     "Here is the corrected bug.js:" / "Updated src/app.ts:" / "Fixed foo.py"
  //     + a ```...``` block. Common for debug/edit-existing narration where the
  //     model rewrites the whole file. write_file OVERWRITES, which is correct
  //     for a fix. We require a filename-with-extension to avoid false matches.
  //     CRITICAL: only treat a block as a write when it is preceded by a
  //     write-intent verb (wrote/write/correct/fix/update/edit/revise/patch/
  //     rewrote). Otherwise a *read* narration like "Read bug.js:" + a fenced
  //     block showing the OLD code would be matched and the bug would be
  //     re-written back in. The intent keyword disambiguates read vs write.
  const inlineRe = /(?:wrote|write|writing|correct(?:ed)?|fix(?:ed)?|update(?:d)?|edit(?:ed)?|revise(?:d)?|patch(?:ed)?|rewrote|rewritten|replaced|changed)\b[\s\S]{0,80}?\b([A-Za-z0-9_\-./]+\.(?:rs|ts|js|jsx|tsx|py|toml|json|md|ya?ml|go|java|cpp|c|rb|php|txt|html|css|sh))\b[\s\S]{0,40}?\n+```(?:[a-zA-Z0-9_-]*)\n([\s\S]*?)```/gi;
  while ((m = inlineRe.exec(text))) {
    const path = m[1].trim();
    const content = m[2].replace(/\s+$/, '');
    if (path && content && !calls.some((c) => c.arguments.path === path)) {
      calls.push({ id: mkId(), name: 'write_file', arguments: { path, content } });
    }
  }

  // 5) Bash-style narration: <execute_bash> / <write_to_file> / ```bash
  //    blocks containing `writeFile <path> <<EOF ... EOF` or
  //    `cat > <path> <<'EOF' ... EOF`. Common on tool-capable models that
  //    fall back to describing the shell command instead of calling the tool.
  const bashRe = /<(execute_bash|write_to_file|bash)>\s*\n([\s\S]*?)<\/\1>|```bash\s*\n([\s\S]*?)```/gi;
  while ((m = bashRe.exec(text))) {
    const body = m[2] || m[3] || '';
    const heredocRe = /(?:(?:writeFile|cat\s*>>?|tee)\s+([^\s<>|]+)\s*<<[-]?(\w+)\n([\s\S]*?)\n\2)/g;
    let h: RegExpExecArray | null;
    while ((h = heredocRe.exec(body))) {
      const path = h[1].trim();
      const content = h[3];
      if (path && content) calls.push({ id: mkId(), name: 'write_file', arguments: { path, content } });
    }
  }

  // 6) Bare fenced code block when the task names a specific file. Free models
  //    often answer "here is greeter.js:" + a ```js block with no tool call and
  //    no file annotation. If nothing else matched and an expected path is
  //    supplied (derived from the task), write the block to that path.
  if (calls.length === 0 && expectedPath) {
    const fence = text.match(/```(?:[a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
    const content = fence ? fence[1].replace(/\s+$/, '') : '';
    if (content && content.trim().length > 0) {
      calls.push({ id: mkId(), name: 'write_file', arguments: { path: expectedPath, content } });
    }
  }

  return calls;
}

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
export async function executeProseActions(text: string, deps: ExecuteProseDeps): Promise<number> {
  const calls = parseProseActions(text, deps.expectedPath);
  if (calls.length === 0 || !deps.toolExecutor) return 0;
  try {
    await runToolCalls({
      toolCalls: calls,
      toolExecutor: deps.toolExecutor,
      toolRegistry: deps.toolRegistry ?? null,
      eventStream: deps.eventStream,
      workspaceRoot: deps.workspaceRoot,
      sessionId: deps.sessionId,
    });
    return calls.filter((c) => c.name === 'write_file').length;
  } catch {
    return 0;
  }
}
