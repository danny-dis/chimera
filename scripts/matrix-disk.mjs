// scripts/matrix-disk.mjs
// Full 29-combo live matrix, asserting DISK side-effects + validity.
// Verifies the truncation-hardened write_file: code/debug must land a
// syntactically-valid file OR route to needs_user — never broken-and-done.
//
// Key wiring (matches real chimera-cli):
//   new ToolExecutor(toolRegistry, () => 'allow')  // registry is REQUIRED
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));

// load .env
const envPath = join(repoRoot, '.env');
try {
  const txt = readFileSync(envPath, 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { ProviderFactory, ModelRegistry, BudgetEnforcer, RateLimiter, ProviderCostTracker } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');
const { scoreCombo } = await import('./score-combo.mjs');

function adaptProvider(provider) {
  return {
    async complete(messages, options) {
      const mappedMessages = messages.map((m) => {
        const extra = m;
        const msg = { role: m.role, content: m.content };
        if (m.role === 'tool') {
          if (typeof extra.tool_call_id === 'string') msg.toolResultId = extra.tool_call_id;
          else { try { const p = JSON.parse(m.content); if (p.toolCallId) msg.toolResultId = p.toolCallId; } catch {} }
        }
        if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
          msg.toolCalls = extra.tool_calls
            .filter((tc) => tc && tc.function && typeof tc.function.name === 'string')
            .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
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
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: resolveEnvRef(entry.apiKey ?? entry.api_key), baseUrl: resolveEnvRef(entry.baseUrl ?? entry.base_url),
    role: entry.role, timeoutMs: entry.timeoutMs ?? entry.timeout_ms ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

// Load providers from the REAL .chimera/config.yaml so this matrix tests the
// exact wiring the user configured (writer=OpenGateway tencent/hy3,
// reviewer=Google, challenger=Mistral). Mirrors config-loader.resolveEnvRef.
const { parse: parseYaml } = require('yaml');
function resolveEnvRef(v) {
  if (!v) return v;
  const m = String(v).match(/^\$?\${([\w]+)}$/);
  return m ? (process.env[m[1]] || undefined) : v;
}
const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = parseYaml(readFileSync(yamlPath, 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key), baseUrl: resolveEnvRef(p.base_url) }));
const byRole = (role) => resolved.find((p) => p.role === role);
const writerEntry = byRole('writer');
const reviewerEntry = byRole('reviewer');
const challengerEntry = byRole('challenger');
if (!writerEntry || !reviewerEntry || !challengerEntry) {
  console.error(`Missing role(s): writer=${!!writerEntry} reviewer=${!!reviewerEntry} challenger=${!!challengerEntry}`);
  process.exit(2);
}
// expose for the summary line
const writerModel = writerEntry.model;
const reviewerModel = reviewerEntry.model;

const writer = buildProvider(writerEntry);
const reviewer = buildProvider(reviewerEntry);
const challenger = buildProvider(challengerEntry);

const toolRegistry = new ToolRegistry();
for (const tool of allTools) {
  toolRegistry.register(tool);
}
// CORRECT wiring: executor MUST receive the registry, else writes silently fail.
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const VALID = [
  ['ask', 'solo'],
  ['plan', 'solo'], ['plan', 'duo'],
  ['code', 'auto'], ['code', 'solo'], ['code', 'duo'], ['code', 'trio'], ['code', 'fusion'], ['code', 'hive'], ['code', 'swarm'],
  ['debug', 'auto'], ['debug', 'solo'], ['debug', 'duo'], ['debug', 'trio'], ['debug', 'fusion'], ['debug', 'swarm'],
  ['review', 'solo'], ['review', 'auto'], ['review', 'duo'], ['review', 'trio'], ['review', 'fusion'], ['review', 'swarm'],
  ['oal', 'solo'],
  ['auto', 'auto'], ['auto', 'solo'], ['auto', 'duo'], ['auto', 'trio'], ['auto', 'fusion'], ['auto', 'hive'], ['auto', 'swarm'],
];

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

// For debug, seed a buggy bug.js in the working dir.
function seedDebug(workdir) {
  writeFileSync(join(workdir, 'bug.js'), 'function subtract(a, b) {\n  return a + b; // BUG: should subtract\n}\nmodule.exports = subtract;\n');
}

// Validate JS files on disk.
function validateJs(workdir) {
  let valid = 0, broken = 0, files = [];
  for (const f of readdirSync(workdir)) {
    if (!f.endsWith('.js')) continue;
    const fp = join(workdir, f);
    files.push(f);
    try { execFileSync(process.execPath, ['--check', fp], { stdio: 'pipe' }); valid++; }
    catch { broken++; }
  }
  return { valid, broken, files };
}

const results = [];
const failures = [];

async function runCombo(mode, preset) {
  const workdir = join(tmpdir(), `chimera-matrix-${mode}-${preset}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  if (mode === 'debug') seedDebug(workdir);

  const eventStream = new EventStream();
  let toolCalls = 0, diskWrites = 0, writeErrors = 0;
  const evErrors = [];
  eventStream.subscribe('*', (ev) => {
    const t = ev?.type || '';
    if (t.includes('error')) evErrors.push(t);
    if (t === 'tool_call_requested') { toolCalls++; const tn = ev?.call?.tool || ev?.tool; if (tn === 'write_file' || tn === 'edit_file') diskWrites++; }
    if (t === 'tool_error' || (t.includes('tool') && /exit 1|error|fail/i.test(JSON.stringify(ev)))) writeErrors++;
  });

  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);

  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    workdir,
    undefined,
    { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );

  const start = Date.now();
  let result;
  const runOnce = async () => {
    try {
      return await orchestrator.execute({ task: taskFor(mode), mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 });
    } catch (e) {
      return { status: 'throw', error: e instanceof Error ? e.message : String(e) };
    }
  };
  result = await runOnce();
  // Retry once on transient failures (provider empty-content blips, throws)
  // so a one-off API hiccup doesn't poison the unattended audit. A genuine
  // capability gap will still surface on the second attempt.
  const s0 = result?.status;
  if (s0 === 'throw' || s0 === 'error') {
    await new Promise((r) => setTimeout(r, 5000));
    result = await runOnce();
  }
  const ms = Date.now() - start;
  const status = result?.status || 'unknown';

  // Disk assertions for code/debug — but NOT for swarm: swarm is a
  // text-only deliberation preset (sub-agents run complete() with no tools),
  // so it can never satisfy a file-on-disk gate. Asserting disk here produces
  // a false needs_user (code/swarm) or a false pass (debug/swarm, target is
  // pre-seeded). Remove the artifact; score swarm on status/events only.
  let disk = null;
  if ((mode === 'code' || mode === 'debug') && preset !== 'swarm') {
    const js = validateJs(workdir);
    const targetExists = mode === 'code' ? existsSync(join(workdir, 'greeter.js')) : existsSync(join(workdir, 'bug.js'));
    disk = { targetExists, ...js };
    // A "done" with a broken/target-missing file is the failure we are hunting.
    const brokenDone = (status === 'done') && (js.broken > 0 || !targetExists);
    if (brokenDone) {
      failures.push({ mode, preset, status, reason: `done but broken/missing file (broken=${js.broken}, targetExists=${targetExists})` });
    }
  }

  // ponytail: honest quality scalar from evidence the harness already has.
  // Not a real LLM judge (that path is unwired) — a transparent stand-in so
  // the "more agents = better" curve can be plotted. Range 0-1.
  const score = scoreCombo({ mode, preset, status, disk, diskWrites, toolCalls, evErrors });
  const rec = { mode, preset, status, ms, toolCalls, diskWrites, writeErrors, evErrors: [...new Set(evErrors)], disk, quality: score, output: (result?.output || result?.result || result?.error || '').toString().slice(0, 160) };
  results.push(rec);
  const diskStr = disk ? ` disk.target=${disk.targetExists} valid=${disk.valid} broken=${disk.broken}` : '';
  console.log(`  ${mode}/${preset} -> ${status} (${ms}ms tools=${toolCalls} diskW=${diskWrites}${diskStr}${evErrors.length ? ' EV:' + [...new Set(evErrors)].join(',') : ''})${status === 'throw' || status === 'error' ? ' ERR:' + ((result?.error || result?.output || '').toString().slice(0, 300)) : ''}`);

  // cleanup
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

// Quality stand-in imported from score-combo.mjs (pure, unit-tested).
async function main() {
  // Optional: COMBO=mode/preset runs a single combo (smoke test).
  const comboFilter = process.env.COMBO;
  const combos = comboFilter ? VALID.filter(([m, p]) => `${m}/${p}` === comboFilter) : VALID;
  if (comboFilter && combos.length === 0) {
    console.error(`COMBO '${comboFilter}' not found in VALID list.`);
    process.exit(2);
  }
  console.log(`Matrix (disk+validity): writer=${writerModel} reviewer=${reviewerModel} challenger=${challengerEntry.model}${comboFilter ? ` [smoke: ${comboFilter}]` : ''}`);
  let i = 0;
  for (const [mode, preset] of combos) {
    i++;
    console.log(`[${i}/${combos.length}]`);
    await runCombo(mode, preset);
  }
  const done = results.filter((r) => r.status === 'done' || r.status === 'complete').length;
  const codeRows = results.filter((r) => r.mode === 'code' || r.mode === 'debug');
  const codeBrokenDone = codeRows.filter((r) => r.status === 'done' && r.disk && (r.disk.broken > 0 || !r.disk.targetExists));
  console.log(`\n=== SUMMARY: ${done}/${results.length} done/complete ===`);
  console.log(`code/debug rows: ${codeRows.length}, broken-and-done: ${codeBrokenDone.length}`);
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + JSON.stringify(f)); }
  else console.log('No broken-and-done code/debug rows. Truncation guard OK.');

  // Quality stand-in: parse the evidence the harness already collected.
// Imported from score-combo.mjs (pure, unit-tested) so the "more agents =
// better?" curve can be plotted without a live LLM judge.
// ponytail: per-preset quality aggregate — the "more agents = better?" curve.
  const presets = [...new Set(results.map((r) => r.preset))];
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log('\n=== QUALITY BY PRESET (stand-in 0-1, not LLM judge) ===');
  for (const p of presets) {
    const rows = results.filter((r) => r.preset === p);
    const q = avg(rows.map((r) => r.quality));
    const pass = rows.filter((r) => r.status === 'done' || r.status === 'complete').length / rows.length;
    console.log(`  ${p.padEnd(7)} n=${rows.length} avgQuality=${q.toFixed(2)} passRate=${pass.toFixed(2)}`);
  }
  const soloRows = results.filter((r) => r.preset === 'solo');
  const multiRows = results.filter((r) => r.preset !== 'solo' && r.preset !== 'auto');
  const soloQ = avg(soloRows.map((r) => r.quality));
  const multiQ = avg(multiRows.map((r) => r.quality));
  console.log('\n=== SOLO vs MULTI-AGENT ===');
  console.log(`  solo     avgQuality=${soloQ.toFixed(2)}`);
  console.log(`  multi    avgQuality=${multiQ.toFixed(2)}  delta=${(multiQ - soloQ >= 0 ? '+' : '')}${(multiQ - soloQ).toFixed(2)}`);
  if (multiQ <= soloQ) console.log('  NOTE: multi-agent did NOT beat solo on this stand-in — gradient unproven (expected; this is a placeholder metric).');

  const outPath = join(repoRoot, 'scripts', 'matrix-disk-results.json');
  writeFileSync(outPath, JSON.stringify({ writer: writerModel, reviewer: reviewerModel, challenger: challengerEntry.model, ranAt: new Date().toISOString(), results }, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
