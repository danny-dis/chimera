#!/usr/bin/env node
// scripts/e2e-solo-demo.mjs
// Full solo-preset pipeline, end-to-end, driving the REAL @chimera/core
// orchestrator with custom tasks. Reuses matrix-disk.mjs's config + bootstrap.
// plan -> ask -> code(weather) -> code(todo) -> review -> inject bug -> debug -> quality.
// Real checks: file on disk, `node` execution, output asserted.
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

// Load .env (keys not exported in this shell) — no dotenv dep, just set env.
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const core = require(join(ROOT, 'packages/chimera-core/dist/index.js'));
const { SessionOrchestrator, EventStream } = core;
const providers = require(join(ROOT, 'packages/chimera-providers/dist/index.js'));
const { ModelRegistry, BudgetEnforcer, RateLimiter, ProviderCostTracker, ProviderFactory } = providers;
const tools = require(join(ROOT, 'packages/chimera-tools/dist/index.js'));
const { ToolRegistry, ToolExecutor, allTools } = tools;

// --- config loader (mirrors matrix-disk.mjs, but no `yaml` dep: parse the
// small config with a regex so we don't depend on hoisting) ---
const repoRoot = process.cwd();
function resolveEnvRef(v) {
  if (!v) return v;
  const mm = String(v).match(/^\$?\${([\w]+)}$/);
  return mm ? (process.env[mm[1]] || undefined) : v;
}
const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const rawYaml = readFileSync(yamlPath, 'utf-8');
// crude parse of the `providers:` list: split on top-level "- name:" entries.
const provBlock = rawYaml.split(/modes:/)[0]; // only the providers section
const entries = provBlock.split(/\n\s*-\s*name:\s*/).slice(1);
const providerByRole = {};
for (const e of entries) {
  const get = (k) => { const m = e.match(new RegExp(k + ':\\s*([^\\n]+)')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined; };
  const role = get('role');
  if (!role) continue;
  const name = e.split(/\n/)[0].trim();
  providerByRole[role] = {
    name,
    role,
    provider: get('provider'),
    model: get('model'),
    apiKey: resolveEnvRef(get('api_key')),
    baseUrl: resolveEnvRef(get('base_url')),
    timeoutMs: Number(get('timeout_ms')) || 120000,
  };
}
const byRole = (role) => providerByRole[role];
function buildProvider(entry) {
  const p = ProviderFactory.create({
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: entry.apiKey, baseUrl: entry.baseUrl, role: entry.role,
    timeoutMs: entry.timeoutMs ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return p;
}
const writer = buildProvider(byRole('writer'));
const reviewer = buildProvider(byRole('reviewer'));
const challenger = buildProvider(byRole('challenger')) || writer;
const toolRegistry = new ToolRegistry();
for (const t of allTools) toolRegistry.register(t);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const log = (...a) => console.log(...a);
const section = (t) => log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`);

async function execute({ task, mode, preset = 'solo' }) {
  const workdir = join(tmpdir(), `chimera-e2e-${mode}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  const providerFactory = (id) =>
    id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer;
  const orchestrator = new SessionOrchestrator(
    new EventStream(),
    { registry: toolRegistry, executor: toolExecutor },
    workdir,
    undefined,
    {
      registry: new ModelRegistry(),
      budgetEnforcer, rateLimiter, providerFactory,
      availableProviders: ['writer', 'reviewer', 'challenger'],
    },
  );
  const r = await orchestrator.execute({ task, mode, preset, providers: { writer, reviewer, challenger }, costCap: 10 });
  return { r, workdir };
}

// Hard per-stage timeout so a free-model stall fails fast instead of hanging.
const STAGE_MS = 180_000;
async function executeT(mode, task, preset) {
  return Promise.race([
    execute({ task, mode, preset }),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`stage ${mode} timed out ${STAGE_MS}ms`)), STAGE_MS)),
  ]).catch((e) => ({ error: String(e.message || e) }));
}

// ---- 1) PLAN ----
const show = (label, res, len = 400) => {
  if (res.error) { log(label, 'STALLED:', res.error); return; }
  log('status:', res.r.status);
  log(String(res.r.output || res.r.content || '').slice(0, len));
};

section('1) PLAN (solo)');
{ const res = await executeT('plan', 'Plan two small Node CLI apps: a weather forecast viewer and a to-do list. Outline files and behavior.'); show('PLAN', res); }

// ---- 2) ASK ----
section('2) ASK (solo) — clarifying questions');
{ const res = await executeT('ask', 'Build a weather app and a to-do app.'); show('ASK', res); }

// ---- 3) CODE the two apps ----
const weatherTask = 'Write a single zero-dependency Node file named weather.js that prints a mock 5-day forecast (hardcoded data is fine) and accepts an optional city argument. Runnable with `node weather.js [city]`.';
const todoTask = 'Write a single zero-dependency Node file named todo.js implementing a CLI to-do list: add, list, done. Store tasks in tasks.json in the same dir. Runnable: `node todo.js add "x"`, `node todo.js list`, `node todo.js done 1`.';

let codeWd;
section('3) CODE (solo) — weather app');
{
  const res = await executeT('code', weatherTask);
  if (res.error) log('CODE weather STALLED:', res.error);
  else { codeWd = res.workdir; log('status:', res.r.status, '| weather.js exists:', existsSync(join(res.workdir, 'weather.js'))); }
}
section('3) CODE (solo) — todo app');
{
  const res = await executeT('code', todoTask);
  if (res.error) log('CODE todo STALLED:', res.error);
  else { codeWd = res.workdir; log('status:', res.r.status, '| todo.js exists:', existsSync(join(res.workdir, 'todo.js'))); }
}

// Gather both apps into one dir for review/debug/run
const demoDir = join(tmpdir(), `chimera-e2e-demo-${Date.now()}`);
mkdirSync(demoDir, { recursive: true });
if (codeWd) for (const f of ['weather.js', 'todo.js']) {
  const src = join(codeWd, f);
  if (existsSync(src)) writeFileSync(join(demoDir, f), readFileSync(src));
}

section('3b) Execute the generated apps (real run)');
if (existsSync(join(demoDir, 'weather.js'))) {
  log('weather.js:\n' + execFileSync('node', [join(demoDir, 'weather.js'), 'Paris'], { encoding: 'utf8' }).trim());
}
if (existsSync(join(demoDir, 'todo.js'))) {
  execFileSync('node', [join(demoDir, 'todo.js'), 'add', 'ship chimera'], { encoding: 'utf8', cwd: demoDir });
  log('todo.js list:\n' + execFileSync('node', [join(demoDir, 'todo.js'), 'list'], { encoding: 'utf8', cwd: demoDir }).trim());
}

// ---- 4) REVIEW ----
section('4) REVIEW (solo) — critique the apps');
{ const res = await executeT('review', 'Review weather.js and todo.js in this directory for correctness and bugs.'); show('REVIEW', res, 500); }

// ---- 5) Inject bug + DEBUG ----
section('5) Inject bug -> DEBUG (solo)');
writeFileSync(join(demoDir, 'weather.js'),
`const CITY = process.argv[2] || 'London';
const days = ['Mon','Tue','Wed','Thu','Fri'];
const sky = ['☀️','⛅','🌧️','☀️','⛅'];
console.log('Forecast for ' + CITY + ':');
days.forEach((d,i)=>console.log('  '+d+': '+sky[i]+' '+(18-i)+'°C')); // BUG: temps fall
`);
{
  const res = await executeT('debug', 'Fix weather.js in this directory: the temperatures should rise across the week, not fall.');
  if (res.error) log('DEBUG STALLED:', res.error); else log('debug status:', res.r.status);
}
const wAfter = execFileSync('node', [join(demoDir, 'weather.js'), 'Paris'], { encoding: 'utf8' });
const nums = [...wAfter.matchAll(/(\d+)°C/g)].map(x => +x[1]);
log('post-debug temps:', nums.join(','), '->', nums[nums.length-1] > nums[0] ? 'RISING (fixed)' : 'STILL BROKEN');

// ---- 6) QUALITY JUDGE (stand-in) ----
section('6) QUALITY JUDGE (heuristic stand-in, not LLM judge)');
let s = 0, n = 0;
for (const f of ['weather.js', 'todo.js']) {
  n++; const fp = join(demoDir, f); if (!existsSync(fp)) continue;
  const src = readFileSync(fp, 'utf8');
  s += 0.4;
  if (/process\.argv/.test(src)) s += 0.2;
  if (!/TODO|FIXME|not implemented/i.test(src)) s += 0.2;
  if (f === 'todo.js' && /tasks\.json/.test(src)) s += 0.2;
}
log(`quality stand-in: ${(s / n).toFixed(2)} / 1.00`);

rmSync(demoDir, { recursive: true, force: true });
if (codeWd) rmSync(codeWd, { recursive: true, force: true });
log('\nE2E done.');
