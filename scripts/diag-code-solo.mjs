import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync, existsSync, rmSync } from 'fs';
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
const W = process.argv[2] || 'meta/llama-3.1-8b-instruct';
const isGoogle = W.startsWith('google/');
const bp = (e) => ProviderFactory.create({ name: e.name, provider: e.provider, model: e.model, apiKey: e.apiKey, baseUrl: e.baseUrl, role: e.role, timeoutMs: 120000, constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 } });
const writer = bp({ name: 'writer', provider: isGoogle ? 'google' : 'openai-compatible', model: W, apiKey: isGoogle ? process.env.GOOGLE_API_KEY : process.env.CHIMERA_CHEAP_API_KEY, baseUrl: isGoogle ? undefined : NIM, role: 'writer' });
const reviewer = bp({ name: 'reviewer', provider: 'openai-compatible', model: 'meta/llama-3.1-8b-instruct', apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM, role: 'reviewer' });
const challenger = bp({ name: 'challenger', provider: 'google', model: 'gemini-2.5-flash', apiKey: process.env.GOOGLE_API_KEY, role: 'challenger' });
const providers = { writer, reviewer, challenger };
const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
const reg = new ModelRegistry();
const be = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(reg));
const rl = new RateLimiter({ rpm: 60, tpm: 1000000 });
const es = new EventStream();
const toolRegistry = new ToolRegistry(allTools);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const o = new SessionOrchestrator(es, { registry: toolRegistry, executor: toolExecutor }, process.cwd(), undefined, { registry: reg, budgetEnforcer: be, rateLimiter: rl, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] });
const mode = process.argv[3] || 'code';
const preset = process.argv[4] || 'solo';
const f = join(process.cwd(), 'greeter.js');
if (existsSync(f)) rmSync(f);
let r;
try {
  r = await o.execute({ task: 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name.', mode, providers, preset, costCap: 10 });
} catch (e) {
  console.log('THROWN:', e && e.stack ? e.stack.slice(0, 800) : String(e));
  process.exit(1);
}
console.log('FULL_R=' + JSON.stringify(r, (k, v) => typeof v === 'function' ? '[fn]' : v, 2).slice(0, 1500));
console.log('ERROR_FIELD=' + JSON.stringify(r.error));
console.log('DEGRADATION=' + JSON.stringify(r.degradationReason));
console.log('EVENT_TYPES=' + JSON.stringify((r.events || []).map(e => e.type)));
const errEv = (r.events || []).filter(e => e.type === 'error');
console.log('ERR_EVENTS=' + JSON.stringify(errEv.map(e => e.message || e)));
