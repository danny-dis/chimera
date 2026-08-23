// Instrumented debug/solo trace: same wiring as matrix-disk.mjs runCombo,
// but logs EVERY event with full payloads + the raw final output, so we can
// see exactly what the real writer does on the stats.js debug task.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));

const envPath = join(repoRoot, '.env');
try {
  const txt = readFileSync(envPath, 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { ProviderFactory, SimpleModelRegistry, RateLimiter } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');

// pull provider defs from matrix-disk (reuse its config-reading logic)
const mdSrc = readFileSync(join(repoRoot, 'scripts', 'matrix-disk.mjs'), 'utf-8');
const writerModel = process.env.CHIMERA_WRITER_MODEL || null;

// Simplest: reuse matrix-disk's own provider construction by importing its
// exported pieces is impossible (not modular) — replicate minimal version:
const cfgPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = readFileSync(cfgPath, 'utf-8');
console.log('[cfg] writer block present:', /role:\s*writer/.test(cfg));

function yamlProviders(src) {
  // crude parse: "- name: X" list entries under providers: with 4-space fields
  const out = [];
  const lines = src.split('\n');
  let cur = null;
  let inProviders = false;
  for (const line of lines) {
    if (/^providers:/.test(line)) { inProviders = true; continue; }
    if (/^[a-z-]+:/i.test(line) && !inProviders) {
      if (cur) { out.push(cur); cur = null; }
      inProviders = false;
      continue;
    }
    if (!inProviders) continue;
    if (/^\s*-\s/.test(line)) {
      if (cur) out.push(cur);
      cur = {};
      const m = line.match(/^\s*-\s*(\w+):\s*(.+)/);
      if (m) cur[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    } else if (/^\s+(\w+):\s*([^\r\n]*)/.test(line) && cur) {
      const m = line.match(/^\s+(\w+):\s*([^\r\n]*)/);
      cur[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  if (cur) out.push(cur);
  return out.filter((p) => p.role);
}

const provDefs = yamlProviders(cfg);
console.log('[cfg] roles:', provDefs.map((p) => `${p.role}=${p.model}`).join(' '));

function substitute(s) {
  return String(s ?? '').replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '');
}

function makeProvider(def) {
  return ProviderFactory.create({
    provider: def.provider || 'openai-compatible',
    name: def.name || def.role,
    role: def.role || 'writer',
    model: def.model,
    baseUrl: substitute(def.base_url),
    apiKey: substitute(def.api_key),
    constraints: {
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    },
    timeoutMs: 90000,
  });
}

const writerDef = provDefs.find((p) => p.role === 'writer') || provDefs[0];
const reviewerDef = provDefs.find((p) => p.role === 'reviewer') || writerDef;
const challengerDef = provDefs.find((p) => p.role === 'challenger');

const writer = makeProvider(writerDef);
const reviewer = makeProvider(reviewerDef);
const challenger = challengerDef ? makeProvider(challengerDef) : writer;

// Instrument: log every provider call's tail (options + response shape) so
// force-turn failures are visible.
function instrument(p, label) {
  const orig = p.complete.bind(p);
  p.complete = async (messages, opts) => {
    const lastUser = [...(messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
    const isForce = /REQUIRES you to actually call write_file/.test(lastUser);
    const res = await orig(messages, opts);
    console.log(`[LLM ${label}] force=${isForce} tools=${!!(opts?.tools?.length)} toolChoice=${JSON.stringify(opts?.toolChoice ?? null)}`);
    console.log(`[LLM ${label}]   -> content=${JSON.stringify((res.content ?? '').slice(0, 120))} toolCalls=${(res.toolCalls ?? []).length}${res.toolCalls?.length ? ' ' + JSON.stringify(res.toolCalls.map((t) => t.name)) : ''}`);
    return res;
  };
  return p;
}
instrument(writer, 'writer');
instrument(reviewer, 'reviewer');
const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? challenger : writer);

function buildRegistry(providers) {
  const reg = new SimpleModelRegistry();
  for (const prov of providers) {
    if (!prov) continue;
    let info;
    try { info = prov.getModel ? prov.getModel() : null; } catch { info = null; }
    const id = info?.id || info?.name;
    if (!id) continue;
    try {
      reg.register({
        id, name: info.name ?? id, provider: info.provider ?? 'openai-compatible',
        contextWindow: info.contextWindow ?? 128000, maxOutputTokens: info.maxOutputTokens ?? 4096,
        pricing: { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
        capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
        degradationThreshold: 0.75, tier: 'frontier',
      });
    } catch { /* skip */ }
  }
  return reg;
}

const TASK = `Debug and fix the file stats.js in the current directory. It has two bugs: lastIndex() returns arr.length instead of arr.length - 1, and average(arr) divides by zero when arr is empty (should return 0). Fix both bugs directly in stats.js.`;
const SEED = `function lastIndex(arr) {\n  return arr.length;\n}\nfunction average(arr) {\n  return arr.reduce((a, b) => a + b, 0) / arr.length;\n}\nmodule.exports = { lastIndex, average };\n`;

const ws = join(tmpdir(), `chimera-dbgtrace-${Date.now()}`);
mkdirSync(ws, { recursive: true });
writeFileSync(join(ws, 'stats.js'), SEED);

const registry = new ToolRegistry();
for (const t of allTools) registry.register(t);
const executor = new ToolExecutor(registry, () => 'allow');

const eventStream = new EventStream();
eventStream.subscribe('*', (ev) => {
  const t = ev?.type ?? '';
  if (t === 'tool_call_requested') {
    console.log(`[EV] ${t}:`, ev.call?.tool, JSON.stringify(ev.call?.args).slice(0, 160));
  } else if (t === 'tool_call_result') {
    console.log(`[EV] ${t}: exit=${ev.result?.exitCode}`, String(ev.result?.output ?? '').slice(0, 100));
  } else if (t === 'error' || t.includes('error')) {
    console.log(`[EV] ${t}:`, JSON.stringify(ev).slice(0, 200));
  } else {
    console.log(`[EV] ${t}`);
  }
});

const orchestrator = new SessionOrchestrator(
  eventStream,
  { registry, executor },
  ws,
  undefined,
  { registry: buildRegistry([writer, reviewer, challenger]), budgetEnforcer: undefined, rateLimiter: new RateLimiter({ rpm: 60, tpm: 1_000_000 }), providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
);
if (!orchestrator.toolExecutor) throw new Error('no toolExecutor wired');

try {
  console.log('=== RUN START (writer:', writerDef.model, ') ===');
  const res = await orchestrator.execute({ task: TASK, mode: 'debug', preset: 'solo', providers: { writer, reviewer, challenger }, costCap: 10 });
  console.log('=== RESULT ===');
  console.log('status:', res.status);
  const after = readFileSync(join(ws, 'stats.js'), 'utf-8');
  console.log('file changed:', after !== SEED);
  console.log('--- FULL OUTPUT ---');
  console.log(res.output);
  console.log('--- stats.js after ---');
  console.log(after.slice(0, 400));
} finally {
  rmSync(ws, { recursive: true, force: true });
}
