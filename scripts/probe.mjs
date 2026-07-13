// scripts/probe.mjs — capture full stack for a failing combo.
import { createRequire } from 'module';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

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
    name: entry.name, provider: entry.provider, model: entry.model, apiKey: entry.apiKey,
    baseUrl: entry.baseUrl, role: entry.role, timeoutMs: entry.timeoutMs ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

const { parse: parseYaml } = require('yaml');
function resolveEnvRef(v) { if (!v) return v; const m = String(v).match(/^\$?\${([\w]+)}$/); return m ? (process.env[m[1]] || undefined) : v; }
const cfg = parseYaml(readFileSync(join(repoRoot, '.chimera', 'config.yaml'), 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key), baseUrl: resolveEnvRef(p.base_url) }));
const byRole = (role) => resolved.find((p) => p.role === role);
const writerEntry = byRole('writer'); const reviewerEntry = byRole('reviewer'); const challengerEntry = byRole('challenger');
const writer = buildProvider(writerEntry); const reviewer = buildProvider(reviewerEntry); const challenger = buildProvider(challengerEntry);

const toolRegistry = new ToolRegistry();
for (const tool of allTools) toolRegistry.register(tool);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
const budgetEnforcer = new BudgetEnforcer({ perTask: 10, perSession: 100, perDay: 500, alertThresholds: [0.5, 0.8] }, new ProviderCostTracker(new ModelRegistry()));
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const mode = process.env.PROBE_MODE; const preset = process.env.PROBE_PRESET;
function taskFor(m) {
  if (m === 'auto') return 'Reply with exactly the single word: PONG';
  if (m === 'code') return 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name.';
  return 'Reply with exactly the single word: PONG';
}
const workdir = join(tmpdir(), `chimera-probe-${Date.now()}`);
mkdirSync(workdir, { recursive: true });
const eventStream = new EventStream();
const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
const orchestrator = new SessionOrchestrator(eventStream, { registry: toolRegistry, executor: toolExecutor }, workdir, undefined, { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] });

const start = Date.now();
try {
  const result = await orchestrator.execute({ task: taskFor(mode), mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 });
  console.log(`RESULT status=${result?.status} ms=${Date.now()-start}`);
  console.log(JSON.stringify(result).slice(0, 400));
} catch (e) {
  console.log(`THROW ms=${Date.now()-start}`);
  console.log('MESSAGE:', e?.message);
  console.log('STACK:\n', e?.stack);
}
try { rmSync(workdir, { recursive: true, force: true }); } catch {}
process.exit(0);
