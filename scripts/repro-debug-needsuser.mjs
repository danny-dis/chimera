// Repro: narrator model + seeded buggy file + debug/solo. After the fix,
// the prose-fallback write must land (overwrite) and status must be done.
// Run: node scripts/repro-debug-needsuser.mjs
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));

const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { SimpleModelRegistry, RateLimiter } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');

const SEED = `function lastIndex(arr) {\n  // BUG: should be arr.length - 1\n  return arr.length;\n}\nfunction average(arr) {\n  // BUG: divide-by-zero on empty array\n  return arr.reduce((a, b) => a + b, 0) / arr.length;\n}\nmodule.exports = { lastIndex, average };\n`;
const FIXED = `function lastIndex(arr) {\n  if (!Array.isArray(arr) || arr.length === 0) return -1;\n  return arr.length - 1;\n}\nfunction average(arr) {\n  if (!Array.isArray(arr) || arr.length === 0) return 0;\n  return arr.reduce((a, b) => a + b, 0) / arr.length;\n}\nmodule.exports = { lastIndex, average };\n`;

let callCount = 0;
function makeMock() {
  return {
    modelInfo: { provider: 'mock', model: 'narrator-1' },
    getModel() { return { id: 'narrator-1', name: 'narrator-1', provider: 'mock' }; },
    supportsToolCalling() { return true; },
    supportsStructuredOutput() { return true; },
    async complete(messages) {
      callCount++;
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      if (/REQUIRES you to actually call write_file|NOT created any files/.test(lastUser)) {
        return { content: 'Understood. Here is the corrected stats.js:\n\n```js\n' + FIXED + '```\n\nThis fixes both bugs.', usage: { inputTokens: 10, outputTokens: 10 }, toolCalls: [] };
      }
      return { content: "I'll start by listing the files:\n\n```\n$ ls\nstats.js\n```\n\nPlan: change arr.length to arr.length - 1 in lastIndex and guard the empty array in average.", usage: { inputTokens: 10, outputTokens: 10 }, toolCalls: [] };
    },
  };
}

function buildRegistry(providers) {
  const reg = new SimpleModelRegistry();
  for (const prov of providers) {
    const info = prov.getModel ? prov.getModel() : null;
    reg.register({
      id: info.id, name: info.name, provider: 'mock', contextWindow: 128000, maxOutputTokens: 4096,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
      capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
      degradationThreshold: 0.75, tier: 'frontier',
    });
  }
  return reg;
}

async function main() {
  const TASK = `Debug and fix the file stats.js. It has two bugs: lastIndex() returns arr.length instead of arr.length - 1, and average() divides by zero on an empty array (should return 0). Fix both bugs in stats.js.`;

  const writer = makeMock();
  const providerFactory = (id) => writer;

  const ws = mkdtempSync(join(tmpdir(), 'chimera-repro-debug-'));
  writeFileSync(join(ws, 'stats.js'), SEED);

  const registry = new ToolRegistry();
  for (const t of allTools) registry.register(t);
  const executor = new ToolExecutor(registry, () => 'allow');

  const eventStream = new EventStream();
  const events = [];
  eventStream.subscribe('*', (ev) => events.push(ev?.type));

  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry, executor },
    ws,
    undefined,
    { registry: buildRegistry([writer]), budgetEnforcer: undefined, rateLimiter: new RateLimiter({ rpm: 60, tpm: 1_000_000 }), providerFactory, availableProviders: ['writer'] },
  );
  if (!orchestrator.toolExecutor) throw new Error('repro wiring bug: no toolExecutor');

  try {
    const res = await orchestrator.execute({
      task: TASK,
      mode: 'debug',
      preset: 'solo',
      providers: { writer, reviewer: writer, challenger: writer },
      costCap: 10,
    });
    const after = readFileSync(join(ws, 'stats.js'), 'utf-8');
    console.log('=== RESULT ===');
    console.log('status:', res.status);
    console.log('file changed:', after !== SEED);
    console.log('provider.complete calls:', callCount);
    console.log('events:', events.join(','));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
