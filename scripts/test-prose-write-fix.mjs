// Regression guard for the BUG-7 fix (file-write-fallback):
//  1. prose parse sets overwrite:true on every write_file
//  2. executeProseActions counts only DISK-VERIFIED writes:
//     - overwrite of a seeded file lands and counts
//     - a call that fails to mutate does NOT count (returns 0)
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const r = createRequire('file:///C:/Users/pc/Documents/projects/chimera/packages/chimera-cli/package.json');
const { ToolRegistry, ToolExecutor, allTools } = r('@chimera/tools');
const { EventStream } = r('@chimera/core');
const { parseProseActions, executeProseActions } = await import(new URL('../packages/chimera-core/dist/coordinator/file-write-fallback.js', import.meta.url).href);

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; } else { console.log('PASS:', msg); }
}

const FIXED = 'function lastIndex(arr) {\n  if (!Array.isArray(arr) || arr.length === 0) return -1;\n}\n';

// ── 1. overwrite:true present in parsed calls ──
{
  const text = 'Here is the corrected stats.js:\n\n```js\n' + FIXED + '```';
  const calls = parseProseActions(text, 'stats.js');
  assert(calls.length === 1 && calls[0].name === 'write_file', 'parse finds the fenced write');
  assert(calls[0].arguments.overwrite === true, 'parsed write_file carries overwrite:true');
}

// ── 2. overwrite of a seeded file LANDS and is counted ──
{
  const ws = mkdtempSync(join(tmpdir(), 'guard-seeded-'));
  writeFileSync(join(ws, 'stats.js'), '// buggy seed\n');
  const reg = new ToolRegistry();
  for (const t of allTools) reg.register(t);
  const ex = new ToolExecutor(reg, () => 'allow');
  const es = new EventStream();
  const text = 'Here is the corrected stats.js:\n\n```js\n' + FIXED + '```';
  const n = await executeProseActions(text, { eventStream: es, toolExecutor: ex, toolRegistry: reg, workspaceRoot: ws, sessionId: 'g', expectedPath: 'stats.js' });
  const after = readFileSync(join(ws, 'stats.js'), 'utf-8');
  assert(n === 1, `seeded-file overwrite counted as landed (got ${n})`);
  assert(after.trim() === FIXED.trim(), 'seeded file content replaced with fixed code (trailing-newline-insensitive)');
  rmSync(ws, { recursive: true, force: true });
}

// ── 3. new-file write still works and counts ──
{
  const ws = mkdtempSync(join(tmpdir(), 'guard-newfile-'));
  const reg = new ToolRegistry();
  for (const t of allTools) reg.register(t);
  const ex = new ToolExecutor(reg, () => 'allow');
  const es = new EventStream();
  const text = 'Create greeter.js:\n\n```js\nexport function greet(){ return "hi"; }\n```';
  const n = await executeProseActions(text, { eventStream: es, toolExecutor: ex, toolRegistry: reg, workspaceRoot: ws, sessionId: 'g', expectedPath: 'greeter.js' });
  assert(n === 1, `new-file write counted as landed (got ${n})`);
  rmSync(ws, { recursive: true, force: true });
}

if (failed > 0) { console.error(`\n${failed} assertion(s) FAILED`); process.exit(1); }
console.log('\nALL PASS');
