// scripts/mode-preset-matrix.mjs
// Systematic live test of every valid mode×preset combo in Chimera.
// Drives SessionOrchestrator.execute() directly (no --preset CLI flag exists).
// Mirrors adaptProvider + buildProviderFromEntry from cli-router.ts.
//
// Quota strategy: writer + reviewer on NVIDIA NIM (independent free tier),
// challenger on Google Gemini (independent free tier). NO OpenRouter, so the
// shared free-models-per-day cap is never hit across 29 multi-agent calls.
//
// Run from repo root with:  node scripts/mode-preset-matrix.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
// Anchor module resolution at the chimera-cli package so pnpm's @chimera/* symlinks resolve.
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));

// --- load .env (gitignored) into process.env -------------------------------
const envPath = join(repoRoot, '.env');
try {
  const txt = readFileSync(envPath, 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { ProviderFactory, ModelRegistry, BudgetEnforcer, RateLimiter } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');

// --- replicate cli-router adaptProvider ------------------------------------
function adaptProvider(provider) {
  return {
    async complete(messages, options) {
      const mappedMessages = messages.map((m) => {
        const extra = m;
        const msg = {
          role: m.role,
          content: m.content,
        };
        if (m.role === 'tool') {
          if (typeof extra.tool_call_id === 'string') msg.toolResultId = extra.tool_call_id;
          else { try { const p = JSON.parse(m.content); if (p.toolCallId) msg.toolResultId = p.toolCallId; } catch {} }
        }
        if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
          msg.toolCalls = extra.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        }
        return msg;
      });
      const result = await provider.complete(mappedMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat,
        tools: options?.tools,
        cacheControl: options?.cacheControl,
      });
      return {
        content: result.content,
        toolCalls: result.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments })),
        usage: result.usage,
      };
    },
    getModel() { return provider.getModel ? provider.getModel() : { provider: 'adapted', model: 'unknown' }; },
    getModelId() { return provider.getModelId ? provider.getModelId() : 'unknown'; },
  };
}

function buildProvider(entry) {
  const p = ProviderFactory.create({
    name: entry.name,
    provider: entry.provider,
    model: entry.model,
    apiKey: entry.apiKey,
    baseUrl: entry.baseUrl,
    role: entry.role,
    timeoutMs: entry.timeoutMs ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

// --- provider configs (quota-free free tiers) -------------------------------
// WRITER_MODEL / REVIEWER_MODEL can be overridden via env to test the 70B big-writer.
const NIM_BASE = process.env.CHIMERA_CHEAP_BASE_URL || 'https://integrate.api.nvidia.com';
const writerModel = process.env.WRITER_MODEL || 'meta/llama-3.1-8b-instruct';
const reviewerModel = process.env.REVIEWER_MODEL || 'meta/llama-3.1-8b-instruct';

const writerEntry = { name: 'writer', provider: 'openai-compatible', model: writerModel, apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM_BASE, role: 'writer', timeoutMs: 180000 };
const reviewerEntry = { name: 'reviewer', provider: 'openai-compatible', model: reviewerModel, apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM_BASE, role: 'reviewer', timeoutMs: 120000 };
const challengerEntry = { name: 'challenger', provider: 'google', model: process.env.GOOGLE_MODEL || 'gemini-2.5-flash', apiKey: process.env.GOOGLE_API_KEY, role: 'challenger', timeoutMs: 120000 };

const writer = buildProvider(writerEntry);
const reviewer = buildProvider(reviewerEntry);
const challenger = buildProvider(challengerEntry);

// --- tool registry (so code/debug can actually write) ----------------------
const toolRegistry = new ToolRegistry(allTools);
const toolExecutor = new ToolExecutor({ workspaceRoot: process.cwd() });
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new (require('@chimera/providers').ProviderCostTracker)(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

// --- the 29 valid combos ---------------------------------------------------
const VALID = [
  ['ask', 'solo'],
  ['plan', 'solo'], ['plan', 'duo'],
  ['code', 'auto'], ['code', 'solo'], ['code', 'duo'], ['code', 'trio'], ['code', 'fusion'], ['code', 'hive'], ['code', 'swarm'],
  ['debug', 'auto'], ['debug', 'solo'], ['debug', 'duo'], ['debug', 'trio'], ['debug', 'fusion'], ['debug', 'swarm'],
  ['review', 'auto'], ['review', 'duo'], ['review', 'trio'], ['review', 'fusion'], ['review', 'swarm'],
  ['oal', 'solo'],
  ['auto', 'auto'], ['auto', 'solo'], ['auto', 'duo'], ['auto', 'trio'], ['auto', 'fusion'], ['auto', 'hive'], ['auto', 'swarm'],
];

// Task per mode — exercises the mode's CORE function and a disk side-effect where relevant.
function taskFor(mode) {
  switch (mode) {
    case 'ask': return 'Reply with exactly the single word: PONG';
    case 'plan': return 'Write a plan (as markdown) to create a small Node.js CLI that prints "hello". Do not write code files, just the plan.';
    case 'code': return 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name. Include a one-line comment.';
    case 'debug': return 'There is a file bug.js in the current directory with a deliberate bug (it adds instead of subtracts). Fix it so subtract(a,b) returns a-b. Write the corrected file.';
    case 'review': return 'Review this code for bugs: function divide(a,b){ return a*b; }. Reply with PASS or list the issues.';
    case 'oal': return 'Loop: first say STEP1, then say STEP2. Demonstrate a 2-step autonomous loop.';
    case 'auto': return 'Reply with exactly the single word: PONG';
    default: return 'Reply with exactly the single word: PONG';
  }
}

const results = [];
const errors = [];

async function runCombo(mode, preset) {
  const eventStream = new EventStream();
  const captured = [];
  let toolCalls = 0;
  let diskWrites = 0;
  eventStream.subscribe('*', (ev) => {
    const t = ev?.type || '';
    if (t.includes('error')) captured.push({ type: t, detail: ev?.error || ev?.message || JSON.stringify(ev).slice(0, 200) });
    if (t === 'mode_preset_warning') captured.push({ type: t, detail: ev?.message });
    if (t === 'tool_call_requested') { toolCalls++; const tn = ev?.call?.tool || ev?.tool; if (tn === 'write_file' || tn === 'edit_file') diskWrites++; }
  });

  // replicate buildProviderFactory from session-orchestrator.ts
  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);

  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    process.cwd(),
    undefined,
    { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );

  const start = Date.now();
  let result;
  try {
    result = await orchestrator.execute({ task: taskFor(mode), mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 });
  } catch (e) {
    result = { status: 'throw', error: e instanceof Error ? e.message : String(e) };
  }
  const ms = Date.now() - start;

  const status = result?.status || 'unknown';
  const output = (result?.output || result?.result || result?.error || '').toString().slice(0, 300);
  const rec = { mode, preset, status, ms, toolCalls, diskWrites, errors: captured, output };
  results.push(rec);
  if (status !== 'done' && status !== 'complete') errors.push(rec);
  console.log(`  ${mode}/${preset} -> ${status} (${ms}ms, tools=${toolCalls}, disk=${diskWrites}${captured.length ? ', EV:' + captured.map(c=>c.type).join(',') : ''})`);
  // small gap so we don't stampede rate limits
  await new Promise((r) => setTimeout(r, 800));
}

async function main() {
  console.log(`Matrix run: writer=${writerModel} reviewer=${reviewerModel} challenger=${challengerEntry.model}`);
  console.log(`Total combos: ${VALID.length}`);
  for (const [mode, preset] of VALID) {
    await runCombo(mode, preset);
  }
  const done = results.filter((r) => r.status === 'done' || r.status === 'complete').length;
  console.log(`\n=== SUMMARY: ${done}/${results.length} done/complete, ${errors.length} non-success ===`);
  if (errors.length) {
    console.log('Failures:');
    for (const e of errors) console.log(`  ${e.mode}/${e.preset}: ${e.status} | ${JSON.stringify(e.errors).slice(0,200)}`);
  }
  // write results json
  const outPath = join(repoRoot, 'scripts', 'mode-preset-results.json');
  require('fs').writeFileSync(outPath, JSON.stringify({ writer: writerModel, reviewer: reviewerModel, challenger: challengerEntry.model, ranAt: new Date().toISOString(), results }, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
