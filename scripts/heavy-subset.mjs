// scripts/heavy-subset.mjs — heavy writer (70B) on multi-agent presets,
// asserts disk side-effect (greeter.js actually created).
import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync, existsSync, readFileSync as rf } from 'fs';
const repoRoot = 'C:/Users/pc/Documents/projects/chimera';
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
for (const line of readFileSync(join(repoRoot, '.env'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { ProviderFactory, ModelRegistry, BudgetEnforcer, RateLimiter, ProviderCostTracker } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');

const NIM = process.env.CHIMERA_CHEAP_BASE_URL;
const WRITER = process.env.WRITER_MODEL || 'meta/llama-3.1-70b-instruct';
const bp = (e) => ProviderFactory.create({ name: e.name, provider: e.provider, model: e.model, apiKey: e.apiKey, baseUrl: e.baseUrl, role: e.role, timeoutMs: 180000, constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 } });
const writer = bp({ name: 'writer', provider: 'openai-compatible', model: WRITER, apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM, role: 'writer' });
const reviewer = bp({ name: 'reviewer', provider: 'openai-compatible', model: 'meta/llama-3.1-8b-instruct', apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM, role: 'reviewer' });
const challenger = bp({ name: 'challenger', provider: 'google', model: 'gemini-2.5-flash', apiKey: process.env.GOOGLE_API_KEY, role: 'challenger' });
const providers = { writer, reviewer, challenger };
const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
const reg = new ModelRegistry();
const be = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(reg));
const rl = new RateLimiter({ rpm: 60, tpm: 1000000 });

const COMBOS = [['code','trio'],['code','fusion'],['code','hive'],['code','swarm'],['debug','trio'],['debug','fusion'],['review','trio'],['review','fusion']];
async function run(mode, preset) {
  const dir = 'C:/tmp/heavy';
  require('fs').mkdirSync(dir, { recursive: true });
  // ensure clean target
  const target = join(dir, 'greeter.js');
  if (existsSync(target)) require('fs').unlinkSync(target);
  const es = new EventStream();
  let writes = 0;
  es.subscribe('*', (ev) => { if (ev?.type === 'tool_call_requested') { const tn = ev?.call?.tool || ev?.tool; if (tn === 'write_file' || tn === 'edit_file') writes++; } });
  const o = new SessionOrchestrator(es, { registry: new ToolRegistry(allTools), executor: new ToolExecutor({ workspaceRoot: dir }) }, dir, undefined, { registry: reg, budgetEnforcer: be, rateLimiter: rl, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] });
  const task = mode === 'debug'
    ? 'There is a file bug.js in the current directory with a deliberate bug (it adds instead of subtracts). Fix it so subtract(a,b) returns a-b. Write the corrected file.'
    : 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name. Include a one-line comment.';
  const t = Date.now();
  const r = await o.execute({ task, mode, providers, preset, costCap: 10 });
  const created = existsSync(target);
  console.log(`${mode}/${preset} (${WRITER}) -> ${r.status} (${Date.now()-t}ms) writeCalls=${writes} fileCreated=${created} | ${(r.output||'').slice(0,80).replace(/\n/g,' ')}`);
}
for (const [m,p] of COMBOS) await run(m,p);
