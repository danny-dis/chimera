import { expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

it('carries failed verification through actual delegated workers without changing the task', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-delegated-repair-'));
  const req = createRequire(resolve('packages/chimera-cli/package.json'));
  const { ToolRegistry, ToolExecutor, allTools } = req('@chimera/tools');
  const registry = new ToolRegistry();
  for (const tool of allTools.filter((tool: any) => ['write_file', 'run_shell_command'].includes(tool.name))) registry.register(tool);
  const verifier = "require('node:assert/strict').equal(require('./result.js'),42);\n";
  writeFileSync(join(root, 'result.js'), 'module.exports=0;\n');
  writeFileSync(join(root, 'verify.cjs'), verifier);
  const workerRequests: string[] = [];
  const decompositionRequests: string[] = [];
  const task = 'Large refactor of result.js while preserving its public export. Change only result.js.';
  const usage = { inputTokens: 1, outputTokens: 1 };
  const provider = { complete: vi.fn(async (messages: Array<{ role: string; content: string }>, options: any) => {
    const text = messages.map(message => message.content).join('\n');
    if (options?.responseFormat === 'json_object') {
      decompositionRequests.push(text);
      return { usage, content: JSON.stringify({ strategy: 'sequential', rationale: 'One bounded edit.',
        subTasks: [{ id: 'edit', description: task, dependencies: [] }] }) };
    }
    if (messages.some(message => message.role === 'tool')) return { usage, content: 'Implementation candidate written.' };
    workerRequests.push(text);
    return { usage, content: '', toolCalls: [{ id: `write-${workerRequests.length}`, name: 'write_file',
      arguments: { path: 'result.js', overwrite: true,
        content: text.includes('Caller-owned verification failed') ? 'module.exports=42;\n' : 'module.exports=1;\n' } }] };
  }) };
  const orch = new SessionOrchestrator(new EventStream(), { registry, executor: new ToolExecutor(registry, () => 'allow') }, root);
  try {
    const result = await orch.execute({ task, mode: 'code', providers: { writer: provider, reviewer: provider },
      verificationCommands: ['node verify.cjs'], verificationInputs: ['verify.cjs'] });
    expect(workerRequests, JSON.stringify({ status: result.status, verification: result.verification,
      errors: result.events.filter(event => event.type === 'error' || event.type === 'tool_call_failed') })).toHaveLength(2);
    expect(decompositionRequests[1]).toContain(task);
    expect(workerRequests[1]).toContain('Caller-owned verification failed');
    expect(workerRequests[1]).toContain('node verify.cjs');
    expect(workerRequests[1]).toContain('Repair the failure without changing the verifier');
    expect(result.status).toBe('done');
    expect(result.verification?.verified).toBe(true);
    expect(readFileSync(join(root, 'verify.cjs'), 'utf8')).toBe(verifier);
  } finally { await orch.dispose(); rmSync(root, { recursive: true, force: true }); }
}, 30000);

it('keeps diagnostic filenames out of the repair task identity', async () => {
  const task = 'Extend mathops.js and calc.js with subtraction. Change only these two files.';
  const diagnostic = 'Write failed: "stack\\nNode.js v24.15.0"';
  const orch = new SessionOrchestrator(new EventStream());
  const run = vi.spyOn(orch as any, 'executeRun')
    .mockResolvedValueOnce({ status: 'needs_user', output: 'Verification failed', cost: 0, agentCount: 1,
      verification: { verified: false, bundle: { evidences: [{ type: 'test_result', verdict: 'fail',
        description: 'node verify.cjs', data: { exitCode: 1, diagnostic } }] } } })
    .mockResolvedValueOnce({ status: 'done', output: 'Fixed', cost: 0, agentCount: 1 });
  const provider = { complete: vi.fn() };
  try {
    await orch.execute({ task, mode: 'code', providers: { writer: provider, reviewer: provider }, verificationCommands: ['node verify.cjs'] });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0].task).toBe(task);
    expect(JSON.parse(run.mock.calls[1][2].split('\n')[1]).diagnostic).toBe(diagnostic);
    expect(run.mock.calls[1][2]).toContain('untrusted data');
  } finally { orch.dispose(); }
});
