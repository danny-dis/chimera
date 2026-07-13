// scripts/probe-errors.mjs — capture FULL error stack for code/trio + auto/swarm
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
const req = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
const { EventStream } = req('@chimera/core');
const { ToolRegistry, ToolExecutor } = req('@chimera/tools');
const { SessionOrchestrator } = req('@chimera/core');
const { BudgetEnforcer, RateLimiter, ProviderCostTracker, ModelRegistry } = req('@chimera/providers');
const { ProviderFactory } = req('@chimera/providers');

// load .env
try {
  const txt = readFileSync(join(repoRoot, '.env'), 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const yaml = req('yaml');

const { parse: parseYaml } = req('yaml');
const allTools = req('@chimera/tools').getAllTools ? req('@chimera/tools').getAllTools() : [];

function resolveEnvRef(v) {
  if (!v) return v;
  const m = String(v).match(/^\$\{([\w]+)\}$/);
  return m ? (process.env[m[1]] || undefined) : v;
}

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
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: resolveEnvRef(entry.apiKey ?? entry.api_key), baseUrl: resolveEnvRef(entry.baseUrl ?? entry.base_url),
    role: entry.role, timeoutMs: entry.timeoutMs ?? entry.timeout_ms ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = parseYaml(readFileSync(yamlPath, 'utf-8'));
const resolved = [];
for (const p of cfg.providers) {
  const e = { ...p, apiKey: resolveEnvRef(p.apiKey), baseUrl: resolveEnvRef(p.baseUrl) };
  const role = p.role;
  if (role) { const r = Array.isArray(role) ? role : [role]; for (const rr of r) resolved.push({ ...e, role: rr }); }
  else resolved.push({ ...e, role: p.name });
}
const byRole = (role) => resolved.find((p) => p.role === role);
const writer = buildProvider(byRole('writer'));
const reviewer = buildProvider(byRole('reviewer'));
const challenger = buildProvider(byRole('challenger'));

const toolRegistry = new ToolRegistry();
for (const t of allTools) toolRegistry.register(t);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const taskFor = (mode) => ({
  code: 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name. Include a one-line comment.',
  auto: 'Reply with exactly the single word: PONG',
}[mode] || 'Reply with exactly the single word: PONG');

async function runOne(mode, preset) {
  const workdir = join(tmpdir(), `probeerr-${mode}-${preset}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  const eventStream = new EventStream();
  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
  const orchestrator = new SessionOrchestrator(
    eventStream, { registry: toolRegistry, executor: toolExecutor }, workdir, undefined,
    { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );
  console.log(`\n=== ${mode}/${preset} ===`);
  try {
    const result = await orchestrator.execute({ task: taskFor(mode), mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 });
    console.log('STATUS:', result?.status);
    console.log('OUTPUT:', String(result?.output || result?.result || '').slice(0, 120));
  } catch (e) {
    console.log('THROWN. MESSAGE:', e?.message);
    console.log('STACK:\n', e?.stack || e);
  }
}

await runOne('code', 'trio');
await runOne('auto', 'swarm');
console.log('\nDONE');
