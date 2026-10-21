import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

const instances: SessionOrchestrator[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const instance of instances.splice(0)) instance.dispose();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const response = { content: JSON.stringify({ response: 'COMPLETE', confidence: 0.9 }), usage: { inputTokens: 1, outputTokens: 1 } };
const reviewer = { complete: async () => ({ ...response, content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }) }) };

it('attributes a delayed provider completion to the budget admitted with that call', async () => {
  let finish!: (value: typeof response) => void;
  let started!: () => void;
  const admitted = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<typeof response>(resolve => { finish = resolve; });
  const writer: LLMProvider = {
    getPricing: () => ({ inputPerMillion: 1_000_000, outputPerMillion: 0 }),
    complete: async () => { started(); return pending; },
  };
  const orchestrator = new SessionOrchestrator(new EventStream());
  instances.push(orchestrator);
  const execution = orchestrator.execute({ task: 'Hello', mode: 'ask', costCap: 10, providers: { writer, reviewer } });
  await admitted;
  const oldBudget = (orchestrator as any)._taskBudget;
  const otherBudget = { ...oldBudget, task: 'other task', providerSpend: 0 };
  // Isolate the reviewed wrong-state write; this does not simulate concurrent public execute calls.
  (orchestrator as any)._taskBudget = otherBudget;
  finish(response);
  await execution;
  expect(oldBudget.providerSpend).toBe(1);
  expect(otherBudget.providerSpend).toBe(0);
});

it('repair retains the original caller command and generated-output contract', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-verifier-contract-'));
  roots.push(root);
  const commands = ['original check'];
  const outputs = ['dist'];
  const executed: string[] = [];
  const execute = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    executed.push(args.command as string);
    return { success: true, data: { exitCode: executed.length === 1 ? 1 : 0 }, duration: 0 };
  });
  const orchestrator = new SessionOrchestrator(new EventStream(), {
    registry: { has: name => name === 'run_shell_command', getAll: () => [] }, executor: { execute },
  }, root);
  instances.push(orchestrator);
  let first = true;
  const writer = { complete: async () => {
    if (first) { first = false; commands[0] = 'weaker check'; outputs[0] = 'different-output'; }
    return response;
  } };
  const result = await orchestrator.execute({ task: 'implement feature', mode: 'code', preset: 'solo',
    verificationCommands: commands, verificationOutputs: outputs, providers: { writer, reviewer }, maxRetries: 1 });
  expect(executed).toEqual(['original check', 'original check']);
  expect(result.status).toBe('done');
  expect((orchestrator.exportState() as any).verificationContract).toEqual({ commands: ['original check'], generatedOutputs: ['dist'] });
});
