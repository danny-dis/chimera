// scripts/probe-swarm.mjs
// Targeted evidence probe for the swarm preset. Prints the FULL deliberation
// result (status, degraded, degradationReason, analysis, swarm internal
// output) for code/swarm + review/swarm so the root cause can be fixed
// instead of guessed. Reuses matrix-disk.mjs provider wiring exactly.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';

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
          msg.toolCalls = extra.tool_calls
            .filter((tc) => tc && tc.function && typeof tc.function.name === 'string')
            .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        }
        return msg;
      });
      const result = await provider.complete(mappedMessages, {
        temperature: options?.temperature, maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat, tools: options?.tools, cacheControl: options?.cacheControl,
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
const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = parseYaml(readFileSync(yamlPath, 'utf-8'));
const resolveEnvRef = (v) => { if (!v) return v; const m = String(v).match(/^\$?\${([\w]+)}$/); return m ? (process.env[m[1]] || undefined) : v; };
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

async function probe(mode) {
  const workdir = join(tmpdir(), `chimera-swarm-probe-${mode}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  if (mode === 'code') writeFileSync(join(workdir, 'greeter.js'), '');
  const eventStream = new EventStream();
  const evTypes = [];
  eventStream.subscribe('*', (ev) => { const t = ev?.type || ''; if (t.includes('error')) evTypes.push(t); });
  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);
  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    workdir, undefined,
    { registry: new ModelRegistry(), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );
  const task = mode === 'code'
    ? 'Write a single file named greeter.js in the current directory containing a function greet(name) that returns "Hello, " + name.'
    : 'Review this code for bugs: function divide(a,b){ return a*b; }. Reply with PASS or list the issues.';
  const start = Date.now();
  let result;
  try { result = await orchestrator.execute({ task, mode, providers: { writer, reviewer, challenger }, preset: 'swarm', costCap: 10 }); }
  catch (e) { result = { status: 'throw', error: e instanceof Error ? e.message : String(e) }; }
  console.log(`\n=== ${mode}/swarm (${Date.now() - start}ms) ===`);
  console.log('status:', result?.status);
  console.log('degraded:', result?.degraded);
  console.log('degradationReason:', result?.degradationReason);
  console.log('output (first 200):', (result?.output || '').toString().slice(0, 200));
  if (result?.analysis) console.log('analysis.thought:', result.analysis.thought);
  console.log('errorEvents:', evTypes);
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
}

await probe('code');
await probe('review');
console.log('\nDONE');
