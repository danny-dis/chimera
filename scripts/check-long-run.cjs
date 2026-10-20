const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SessionOrchestrator, EventStream } = require('../packages/chimera-core/dist/index.js');
const { SimpleModelRegistry } = require('../packages/chimera-providers/dist/index.js');
const { ToolRegistry, ToolExecutor, allTools } = require('../packages/chimera-tools/dist/index.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-endurance-'));
const canary = 'PROJECT_CONTEXT_CANARY_871: preserve input.txt and verify.cjs; write only result.js.';
const verifier = "require('node:assert/strict').equal(require('./result.js'),80);";
fs.writeFileSync(path.join(root, 'AGENTS.md'), canary);
fs.writeFileSync(path.join(root, 'input.txt'), 'controlled-read-payload');
fs.writeFileSync(path.join(root, 'verify.cjs'), verifier);
const events = new EventStream();
const registry = new ToolRegistry();
for (const tool of allTools.filter(t => ['read_file','write_file','run_shell_command'].includes(t.name))) registry.register(tool);
const executor = new ToolExecutor(registry, () => 'allow');
let step = 0, injected = false;
const observed = [];
const reply = (content, toolCalls) => ({ content, usage: { inputTokens: 1, outputTokens: 1 }, ...(toolCalls ? { toolCalls } : {}) });
const writer = { getModelId: () => 'controlled-writer', complete: async (messages, options) => {
  if (!options?.tools?.length) return reply(JSON.stringify({ verdict: 'pass', issues: [], confidence: 0.95, commentary: 'Controlled check.' }));
  observed.push(messages.map(m => m.content).join('\n'));
  if (step === 30 && !injected) { injected = true; throw new Error('503 controlled transient provider failure'); }
  if (step < 80) { step++; return reply('', [{ id: `read-${step}`, name: 'read_file', arguments: { path: 'input.txt' } }]); }
  if (step === 80) { step++; return reply('', [{ id: 'write-result', name: 'write_file', arguments: { path: 'result.js', content: 'module.exports=80;' } }]); }
  return reply('Controlled task completed; the result is ready for caller verification.');
} };
const reviewer = { ...writer, getModelId: () => 'controlled-reviewer' };
const orch = new SessionOrchestrator(events, { registry, executor }, root, undefined, { registry: new SimpleModelRegistry() });
(async () => {
  const result = await orch.execute({
    task: 'Create result.js as a CommonJS module exporting 80 after reading input.txt 80 times. Run node verify.cjs.',
    mode: 'code', preset: 'solo', providers: { writer, reviewer }, costCap: 1,
    maxToolRounds: 100, timeoutMs: 30000,
    verificationCommands: ['node verify.cjs'], verificationInputs: ['verify.cjs'],
  });
  const reads = result.events.filter(e => e.type === 'tool_call_requested' && e.call.tool === 'read_file').length;
  console.log(JSON.stringify({ controlled: true, status: result.status, output: result.output, step, reads, observedCalls: observed.length, eventErrors: result.events.filter(e => e.type === 'error') }));
  if (process.argv.includes('--context-only')) {
    assert.ok(observed.length > 0 && observed.every(text => text.includes(canary)), 'Project context must survive every tool continuation');
    console.log(JSON.stringify({ controlled: true, contextOnly: true, observedCalls: observed.length })); return;
  }
  assert.equal(reads, 80, 'The production loop must execute every requested read');
  assert.equal(result.status, 'done', result.output);
  assert.equal(result.verification?.verified, true);
  assert.equal(fs.readFileSync(path.join(root, 'verify.cjs'), 'utf8'), verifier);
  assert.ok(injected && result.events.some(e => e.type === 'llm_retry'), 'Transient failure must be recovered');
  assert.ok(observed.every(text => text.includes(canary)), 'Project context must survive every tool continuation');
  console.log(JSON.stringify({ controlled: true, readCalls: reads, recoveredProviderFailure: injected, verifierUntouched: true, verified: true, contextRetained: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await orch.dispose();
  await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5 });
});
