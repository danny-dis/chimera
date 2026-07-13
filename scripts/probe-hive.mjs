// scripts/probe-hive.mjs — capture the real error for code/hive with the OpenGateway writer.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

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
const { parse: parseYaml } = require('yaml');

function resolveEnvRef(v) {
  if (!v) return v;
  const m = String(v).match(/^\$?\${([\w]+)}$/);
  return m ? (process.env[m[1]] || undefined) : v;
}
const cfg = parseYaml(readFileSync(join(repoRoot, '.chimera', 'config.yaml'), 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key), baseUrl: resolveEnvRef(p.base_url) }));
const byRole = (role) => resolved.find((p) => p.role === role);

function adaptProvider(provider) {
  return {
    async complete(messages, options) {
      const mappedMessages = messages.map((m) => {
        const msg = { role: m.role, content: m.content };
        if (m.role === 'tool') {
          if (typeof m.tool_call_id === 'string') msg.toolResultId = m.tool_call_id;
        }
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
          msg.toolCalls = m.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        }
        return msg;
      });
      const result = await provider.complete(mappedMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat,
        tools: options?.tools,
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
  return adaptProvider(ProviderFactory.create({
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: entry.apiKey, baseUrl: entry.baseUrl, role: entry.role,
    timeoutMs: entry.timeoutMs ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  }));
}

const writer = buildProvider(byRole('writer'));
const reviewer = buildProvider(byRole('reviewer'));
const challenger = buildProvider(byRole('challenger'));

const toolRegistry = new ToolRegistry();
for (const tool of allTools) toolRegistry.register(tool);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const workdir = join(tmpdir(), `probe-hive-${Date.now()}`);
mkdirSync(workdir, { recursive: true });
const eventStream = new EventStream();
eventStream.subscribe('*', (ev) => {
  const t = ev?.type || '';
  if (t.includes('error')) {
    console.log('EVENT_ERROR:', JSON.stringify(ev).slice(0, 800));
  }
});

const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
const orchestrator = new SessionOrchestrator(
  eventStream,
  { registry: toolRegistry, executor: toolExecutor },
  workdir,
  undefined,
  { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
);

const task = 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name. Include a one-line comment.';
console.log('--- running code/hive ---');
try {
  const result = await orchestrator.execute({ task, mode: 'code', providers: { writer, reviewer, challenger }, preset: 'hive', costCap: 10 });
  console.log('STATUS:', result.status);
  console.log('RESULT(error?):', JSON.stringify(result).slice(0, 1200));
} catch (e) {
  console.log('THROWN:', e && e.stack ? e.stack : String(e));
}
console.log('greeter.js exists:', existsSync(join(workdir, 'greeter.js')));
try { rmSync(workdir, { recursive: true, force: true }); } catch {}
