// Probe: reproduce the pre-existing-file edit failure with full event trace.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
const { ProviderFactory, SimpleModelRegistry, RateLimiter } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');
const { parse: parseYaml } = require('yaml');

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

function resolveEnvRef(v) {
  if (!v) return v;
  const m = String(v).match(/^\$?\$\{([\w]+)\}$/);
  return m ? (process.env[m[1]] || undefined) : v;
}

const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = parseYaml(readFileSync(yamlPath, 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key ?? p.apiKey), baseUrl: resolveEnvRef(p.base_url ?? p.baseUrl) }));
const writerEntry = resolved.find((p) => p.role === 'writer');

function buildProvider(entry) {
  const p = ProviderFactory.create({
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: entry.apiKey, baseUrl: entry.baseUrl,
    role: entry.role, timeoutMs: entry.timeoutMs ?? entry.timeout_ms ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

const wsRoot = join(repoRoot, 'smoke-tmp', 'dd-probe-ws');
mkdirSync(wsRoot, { recursive: true });

// Seed the buggy file the task will ask to edit
const targetRel = 'calc.js';
const seed = 'function add(a, b) {\n  return a - b;\n}\nmodule.exports = { add };\n';
writeFileSync(join(wsRoot, targetRel), seed);

const toolRegistry = new ToolRegistry();
for (const tool of allTools) toolRegistry.register(tool);
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');

// Log every tool execution result
const origExecute = toolExecutor.execute.bind(toolExecutor);
toolExecutor.execute = async (...args) => {
  try {
    const r = await origExecute(...args);
    console.log('[EXEC OK]', args[0]?.name, JSON.stringify(args[0]?.arguments)?.slice(0, 160), '=>', JSON.stringify(r)?.slice(0, 200));
    return r;
  } catch (e) {
    console.log('[EXEC FAIL]', args[0]?.name, JSON.stringify(args[0]?.arguments)?.slice(0, 160), '=>', e.message);
    throw e;
  }
};

const writer = buildProvider(writerEntry);

const reg = new SimpleModelRegistry();
const info = writer.getModel ? writer.getModel() : null;
reg.register({
  id: info?.id || info?.name || 'writer',
  name: info?.name ?? 'writer',
  provider: 'openai-compatible',
  contextWindow: 128000,
  maxOutputTokens: 4096,
  pricing: { inputPerMillion: 0, outputPerMillion: 0, cacheReadPerMillion: 0, cacheWritePerMillion: 0 },
  capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
  degradationThreshold: 0.75,
  tier: 'frontier',
});

const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const eventStream = new EventStream();
eventStream.subscribe('*', (ev) => {
  const t = ev?.type || '';
  if (t.includes('error') || t.includes('tool') || t.includes('warn') || t.includes('degrad') || t.includes('force')) {
    let detail = '';
    try { detail = JSON.stringify(ev).slice(0, 300); } catch {}
    console.log(`[EV] ${t} ${detail}`);
  }
});

// Compiled SessionOrchestrator takes POSITIONAL args:
// (eventStream, tools, workspaceRoot, memory, options)
const orchestrator = new SessionOrchestrator(
  eventStream,
  { registry: toolRegistry, executor: toolExecutor },
  wsRoot,
  undefined,
  { registry: reg, rateLimiter, providerFactory: () => writer, availableProviders: ['writer'] },
);

const task = `Edit calc.js in the workspace root: add(a,b) must return a+b instead of a-b. Keep module.exports intact.`;

console.log('--- before:', statSync(join(wsRoot, targetRel)).size, 'bytes');

const result = await orchestrator.execute({ task, mode: 'code', preset: 'solo', providers: { writer, reviewer: writer, challenger: writer } });

console.log('--- status:', result.status);
console.log('--- output:', String(result.output ?? '').slice(0, 400));
console.log('--- after :', readFileSync(join(wsRoot, targetRel), 'utf-8').replace(/\n/g, '\\n'));
console.log(result.status === 'done' && readFileSync(join(wsRoot, targetRel), 'utf-8').includes('a + b') ? 'PROBE: FIXED' : 'PROBE: NOT-FIXED');
