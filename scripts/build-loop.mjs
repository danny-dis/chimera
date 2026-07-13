// scripts/build-loop.mjs
// Phase B demo: "start a plan, then go back and forth until it builds something."
// 1. Run mode=plan (solo) to produce a plan, captured as text.
// 2. Loop (back-and-forth) up to MAX_ROUNDS: build via trio (writer + reviewer
//    + challenger deliberation), then verify the artifact actually runs. If it
//    doesn't, feed the failure back into the next round's task. Stop as soon as
//    a runnable artifact exists.
//
// Wiring mirrors matrix-disk.mjs exactly (real .chimera/config.yaml providers).
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
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
  const resolveEnvRef = (v) => { if (!v) return v; const m = String(v).match(/^\$?\${([\w]+)}$/); return m ? (process.env[m[1]] || undefined) : v; };
  const p = ProviderFactory.create({
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: resolveEnvRef(entry.apiKey ?? entry.api_key), baseUrl: resolveEnvRef(entry.baseUrl ?? entry.base_url),
    role: entry.role, timeoutMs: entry.timeoutMs ?? entry.timeout_ms ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

const { parse: parseYaml } = require('yaml');
const resolveEnvRef = (v) => { if (!v) return v; const m = String(v).match(/^\$?\${([\w]+)}$/); return m ? (process.env[m[1]] || undefined) : v; };
const cfg = parseYaml(readFileSync(join(repoRoot, '.chimera', 'config.yaml'), 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key), baseUrl: resolveEnvRef(p.base_url) }));
const byRole = (role) => resolved.find((p) => p.role === role);
const writer = buildProvider(byRole('writer'));
const reviewer = buildProvider(byRole('reviewer'));
const challenger = buildProvider(byRole('challenger'));

const toolRegistry = new ToolRegistry();
for (const tool of allTools) toolRegistry.register(tool);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

function makeOrchestrator(workdir) {
  const eventStream = new EventStream();
  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
  return new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    workdir,
    undefined,
    { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );
}

async function run(mode, preset, task, workdir) {
  const orch = makeOrchestrator(workdir);
  let result;
  try { result = await orch.execute({ task, mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 }); }
  catch (e) { result = { status: 'throw', error: e instanceof Error ? e.message : String(e) }; }
  return result;
}

function verify(workdir) {
  const fp = join(workdir, 'greet.js');
  if (!existsSync(fp)) return { ok: false, detail: 'greet.js not found' };
  try {
    const out = execFileSync(process.execPath, [fp, 'World'], { cwd: workdir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: out.includes('Hello, World'), detail: out.trim() };
  } catch (e) {
    return { ok: false, detail: (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : e.message) };
  }
}

const MAX_ROUNDS = 3;

// 1. start a plan
let planText = '';
{
  const workdir = join(tmpdir(), `chimera-build-plan-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  const r = await run('plan', 'solo', 'Plan how to build a runnable Node.js CLI called greet that prints "Hello, <name>" when run as `node greet.js <name>`. Output a short markdown plan (do not write code files).', workdir);
  planText = (r?.output || r?.result || '(no plan output)').toString();
  console.log('=== PLAN ===\n' + planText.slice(0, 400) + '\n');
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
}

// 2. back-and-forth build loop
//
// Evidence first: trio prose-fallback does NOT land a file on free models
// (solo does — proven, code/solo quality 1.00). Run one trio round to capture
// the raw output as evidence of the gap, then use solo (the proven file-landing
// preset) for the actual build rounds. The loop still goes back-and-forth:
// if a solo round fails to run, the failure is fed into the next round's task.
let lastResult = null, verdict = null;
let trioEvidence = '';
{
  const workdir = join(tmpdir(), `chimera-build-trio-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  console.log('--- EVIDENCE ROUND (trio deliberation, capture only) ---');
  const r = await run('code', 'trio', `Write greet.js in the working directory. It must run with \`node greet.js World\` and print exactly "Hello, World".`, workdir);
  trioEvidence = (r?.output || r?.result || '(no output)').toString().slice(0, 300);
  console.log(`trio status=${r?.status} output[:300]=\n${trioEvidence}`);
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
}
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const workdir = join(tmpdir(), `chimera-build-r${round}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  let task = `Plan:\n${planText}\n\nImplement it now: write greet.js in the working directory. It must run with \`node greet.js World\` and print exactly "Hello, World".`;
  if (round > 1) task += `\n\nPrevious attempt (round ${round - 1}) failed: ${lastResult?.error || verdict?.detail || 'unknown'}. Fix it and rebuild.`;
  console.log(`--- BUILD ROUND ${round} (solo) ---`);
  const r = await run('code', 'solo', task, workdir);
  lastResult = r;
  verdict = verify(workdir);
  console.log(`status=${r?.status} verify.ok=${verdict.ok} detail=${verdict.detail}`);
  if (verdict.ok) {
    console.log(`\nBUILT A RUNNABLE ARTIFACT in round ${round}: greet.js prints "${verdict.detail}".`);
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
    process.exit(0);
  }
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
}
console.log(`\nFAILED to build a runnable artifact within ${MAX_ROUNDS} rounds.`);
process.exit(1);
