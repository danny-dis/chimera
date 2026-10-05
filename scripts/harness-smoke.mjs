// scripts/harness-smoke.mjs — BUG-8 CI smoke for the matrix harness.
//
// Runs the REAL matrix-disk.mjs pipeline end-to-end against a scripted
// mock provider (no network, no API keys), asserting the invariants that
// silently rotted twice before (72b668d broke it; the stale 18/30 score
// survived for weeks):
//   1. The harness loads and wires tools into SessionOrchestrator.
//   2. A code task with a narrator-style model produces a file on disk
//      via the prose fallback chain (BUG-7 regression guard).
//   3. Grading runs and returns a sane shape.
//
// Exit 0 = harness healthy. Any failure exits non-zero with detail.

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); failed++; } else { console.log('PASS:', msg); }
};

// ── 1. Harness script parses + its imports exist ──
{
  const src = readFileSync(join(repoRoot, 'scripts', 'matrix-disk.mjs'), 'utf-8');
  const imports = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  const missing = [];
  for (const spec of imports) {
    if (!spec.startsWith('.') && !spec.startsWith('@')) continue;
    try {
      // Workspace packages resolve via chimera-cli's deps (pnpm workspace
      // layout — they are not dependencies of scripts/ itself).
      const req = (await import('module')).createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
      req(spec);
    } catch {
      missing.push(spec);
    }
  }
  assert(missing.length === 0, `all harness requires resolve (missing: ${missing.join(', ') || 'none'})`);
}

// ── 2. End-to-end: real orchestrator + scripted narrator model ──
// Mirrors scripts/repro-debug-needsuser.mjs wiring EXACTLY (positional
// tools arg). If someone changes the orchestrator ctor or breaks the prose
// fallback, this catches it without any live provider.
{
  const require = (await import('module')).createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
  const { SessionOrchestrator, EventStream } = require('@chimera/core');
  const { SimpleModelRegistry, RateLimiter } = require('@chimera/providers');
  const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');

  const FIXED = 'function lastIndex(arr) {\n  return arr.length - 1;\n}\nfunction average(arr) {\n  var t = 0;\n  for (var i = 0; i < arr.length; i++) t += arr[i];\n  return arr.length === 0 ? 0 : t / arr.length;\n}\nmodule.exports = { lastIndex: lastIndex, average: average };\n';

  // Narrator model: mimics the free models that answer in fenced prose
  // instead of emitting a write_file tool call.
  const narrator = {
    getModel() { return { id: 'harness-smoke-narrator', name: 'harness-smoke-narrator', provider: 'mock' }; },
    async complete(messages) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      if (/REQUIRES you to actually call write_file/.test(lastUser)) {
        // Forced turn: still narrate (the exact BUG-7 behavior).
        return {
          content: 'Understood. Here is the corrected stats.js:\n\n```js\n' + FIXED + '```',
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 50 },
        };
      }
      return {
        content: 'I reviewed stats.js and found the bugs.\n\n```js\n' + FIXED + '```',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 40 },
      };
    },
  };

  const registry = new ToolRegistry();
  for (const t of allTools) registry.register(t);
  const executor = new ToolExecutor(registry, () => 'allow');

  const ws = join(tmpdir(), `harness-smoke-${Date.now()}`);
  import('fs').then((fs) => fs.mkdirSync(ws, { recursive: true }));
  (await import('fs')).mkdirSync(ws, { recursive: true });
  (await import('fs')).writeFileSync(
    join(ws, 'stats.js'),
    'function lastIndex(arr) {\n  return arr.length;\n}\nmodule.exports = {};\n',
  );

  const reg = new SimpleModelRegistry();
  try {
    reg.register({
      id: 'harness-smoke-narrator', name: 'harness-smoke-narrator', provider: 'mock',
      contextWindow: 32000, maxOutputTokens: 2048,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
      degradationThreshold: 0.75, tier: 'frontier',
    });
  } catch {}

  const es = new EventStream();
  const orchestrator = new SessionOrchestrator(
    es,
    { registry, executor },           // positional tools — the wiring that rotted once
    ws,
    undefined,
    { registry: reg, rateLimiter: new RateLimiter({ rpm: 600, tpm: 1_000_000 }), availableProviders: ['writer'] },
  );
  assert(!!orchestrator.toolExecutor, 'orchestrator.toolExecutor is wired');

  let result;
  try {
    result = await orchestrator.execute({
      task: 'Debug and fix the file stats.js in the current directory. lastIndex(arr) must return the index of the final element (-1 for empty). Fix every bug you find directly in stats.js.',
      mode: 'debug',
      preset: 'solo',
      providers: { writer: narrator, reviewer: narrator, challenger: narrator },
      costCap: 10,
    });
  } catch (e) {
    assert(false, `orchestrator.execute threw: ${e.message}`);
  }

  assert(result?.status === 'done', `status=done (got ${result?.status})`);
  const after = readFileSync(join(ws, 'stats.js'), 'utf-8');
  assert(after.includes('arr.length - 1'), 'target file actually fixed on disk (prose fallback landed)');
  rmSync(ws, { recursive: true, force: true });
}

// ── 3. Grader loads and grades a synthetic workdir ──
{
  const { gradeTask } = await import('./grade-task.mjs');
  const ws = mkdtempSync(join(tmpdir(), 'harness-grade-'));
  writeFileSync(
    join(ws, 'stats.js'),
    'function lastIndex(arr){ return arr.length > 0 ? arr.length - 1 : -1; }\nfunction average(arr){ if (!arr || arr.length === 0) return 0; var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i]; return t / arr.length; }\nmodule.exports = { lastIndex, average };\n',
  );
  const g = gradeTask('debug', ws);
  assert(g.gradeable === true && g.passed === g.total && g.total >= 7, `grader scores perfect artifact ${g.passed}/${g.total}`);
  rmSync(ws, { recursive: true, force: true });

  const empty = mkdtempSync(join(tmpdir(), 'harness-grade-empty-'));
  const g2 = gradeTask('debug', empty);
  assert(g2.targetExists === false && g2.ratio === 0, 'grader reports missing target honestly');
  rmSync(empty, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\nharness-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nharness-smoke: ALL PASS');
