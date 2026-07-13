import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync } from 'fs';
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
const bp = (e) => ProviderFactory.create({ name: e.name, provider: e.provider, model: e.model, apiKey: e.apiKey, baseUrl: e.baseUrl, role: e.role, timeoutMs: 120000, constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 } });
const writer = bp({ name: 'writer', provider: 'openai-compatible', model: 'meta/llama-3.1-8b-instruct', apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM, role: 'writer' });
const reviewer = bp({ name: 'reviewer', provider: 'openai-compatible', model: 'meta/llama-3.1-8b-instruct', apiKey: process.env.CHIMERA_CHEAP_API_KEY, baseUrl: NIM, role: 'reviewer' });
const challenger = bp({ name: 'challenger', provider: 'google', model: 'gemini-2.5-flash', apiKey: process.env.GOOGLE_API_KEY, role: 'challenger' });
const providers = { writer, reviewer, challenger };
const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
const reg = new ModelRegistry();
const be = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(reg));
const rl = new RateLimiter({ rpm: 60, tpm: 1000000 });
const es = new EventStream();
es.subscribe('*', (ev) => { if (ev && ev.type === 'fusion_judge_parse_error') { console.log('=== RAW JUDGE OUTPUT (unparseable) ==='); console.log(ev.raw); console.log('=== END RAW ==='); } });
const o = new SessionOrchestrator(es, { registry: new ToolRegistry(allTools), executor: new ToolExecutor({ workspaceRoot: process.cwd() }) }, process.cwd(), undefined, { registry: reg, budgetEnforcer: be, rateLimiter: rl, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] });
const r = await o.execute({ task: 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name.', mode: 'code', providers, preset: 'fusion', costCap: 10 });
console.log('RESULT:', r.status);
