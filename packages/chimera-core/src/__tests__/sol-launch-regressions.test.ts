import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

const usage = { inputTokens: 1, outputTokens: 1 };
const provider: LLMProvider = { complete: async () => ({ content: 'actual answer', usage }) };
const delib = { mode: 'solo', output: 'unified actual result', analysis: { confidence: 0.9 },
  totalCostUsd: 0, totalTokens: 2, durationMs: 0, degraded: false };
const roots: string[] = [];
const orchestrators: SessionOrchestrator[] = [];
function fixture(options: any = {}, tools?: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-sol-'));
  roots.push(root);
  const orch = new SessionOrchestrator(new EventStream(), tools, root, undefined, options);
  orchestrators.push(orch);
  return { orch, root };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const orch of orchestrators.splice(0)) orch.dispose();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('loads the source execution seam, not a dist test', () => {
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../session-orchestrator.ts');
  console.log('SOL_TEST_SOURCE=' + source);
  expect(fs.existsSync(source)).toBe(true);
  expect(SessionOrchestrator.prototype.execute.toString()).toContain('executeRun');
});

describe('SOL04 child signal composition at orchestrator wrappers', () => {
  it.each(['provider', 'tool'] as const)('preserves child abort and rejects late %s results', async kind => {
    const child = new AbortController();
    const parent = new AbortController();
    let received: AbortSignal | undefined;
    let rejected: unknown;
    const reason = new Error('child deadline');
    const writer: LLMProvider = { complete: async (_messages, options) => {
      received = options?.signal;
      expect(options?.temperature).toBe(0.23);
      child.abort(reason);
      return { content: 'late result', usage };
    } };
    const executor = { execute: vi.fn(async (_name, _args, context) => {
      received = context.signal;
      expect(context.mode).toBe('review');
      child.abort(reason);
      return { success: true, duration: 0 };
    }) };
    const { orch } = fixture({ registry: {} }, { registry: { has: () => true, getAll: () => [] }, executor });
    vi.spyOn(orch as any, 'executeWithDeliberation').mockImplementation(async (...args: any[]) => {
      try {
        if (kind === 'provider') await args[2].writer.complete([], { signal: child.signal, temperature: 0.23 });
        else await (orch as any).toolExecutor.execute('read_file', {}, {
          workspaceRoot: (orch as any)._workspaceRoot, sessionId: 'child', eventStream: new EventStream(),
          mode: 'code', signal: child.signal,
        });
      } catch (error) { rejected = error; }
      return delib;
    });
    await orch.execute({ task: 'inspect module boundaries', mode: 'review', preset: 'duo', signal: parent.signal,
      providers: { writer, reviewer: provider } });
    expect(parent.signal.aborted).toBe(false);
    expect(received?.aborted).toBe(true);
    expect(received?.reason).toBe(reason);
    expect(rejected).toBe(reason);
  });
});

describe('SOL07 terminal current-turn extraction', () => {
  it.each(['deliberation', 'delegation', 'inline', 'conversation', 'failure'] as const)('extracts exactly the current %s turn once', async route => {
    const seen: any[] = [];
    const extract = vi.fn(async input => {
      seen.push({ ...input, messages: structuredClone(input.messages) });
      return input.messages.length;
    });
    const { orch } = fixture({ autoExtract: { extract }, ...(route === 'deliberation' ? { registry: {} } : {}) });
    (orch as any)._writerMessages = [{ role: 'user', content: 'OLD PRIVATE TURN' }];
    (orch as any)._extractionCursor = 1;
    if (route === 'deliberation') vi.spyOn(orch as any, 'executeWithDeliberation').mockResolvedValue(delib);
    if (route === 'delegation') {
      vi.spyOn((orch as any).taskRouter, 'classifyTask').mockResolvedValue({ overall: 0.9, dimensions: {} });
      vi.spyOn(orch as any, 'runDelegated').mockResolvedValue({ resolved: true, output: 'delegated actual result', subTaskResults: [], totalTokens: 0 });
    }
    const task = route === 'delegation' ? 'implement independent modules and their integration tests'
      : route === 'conversation' ? 'Hello' : 'inspect module boundaries';
    const writer = route === 'failure' ? { complete: async () => { throw new Error('offline failure'); } } : provider;
    const mode = route === 'inline' || route === 'failure' ? 'oal' : 'review';
    const result = await orch.execute({ task, mode: route === 'conversation' ? 'ask' : mode,
      providers: { writer, reviewer: provider }, maxRetries: 0 });
    await Promise.resolve();
    expect(extract).toHaveBeenCalledTimes(1);
    expect(seen[0].messages.slice(seen[0].cursor)).toEqual([
      { role: 'user', content: task }, { role: 'assistant', content: result.output },
    ]);
    expect(JSON.stringify(seen)).not.toContain('OLD PRIVATE TURN');
    const next = await orch.execute({ task: 'Hello again', mode: 'ask', providers: { writer: provider, reviewer: provider } });
    await Promise.resolve();
    expect(extract).toHaveBeenCalledTimes(2);
    expect(seen[1].messages.slice(seen[1].cursor)).toEqual([
      { role: 'user', content: 'Hello again' }, { role: 'assistant', content: next.output },
    ]);
  });

  it('uses only final repaired output, not the intermediate failed check', async () => {
    const extract = vi.fn(async input => input.messages.length);
    const { orch } = fixture({ autoExtract: { extract } });
    const failed = { type: 'test_result', verdict: 'fail', description: 'caller check', data: { exitCode: 1 } };
    vi.spyOn(orch as any, 'executeRun')
      .mockResolvedValueOnce({ status: 'needs_user', output: 'INTERMEDIATE', cost: 0, agentCount: 1,
        verification: { bundle: { evidences: [failed] } } })
      .mockResolvedValueOnce({ status: 'done', output: 'REPAIRED ACTUAL', cost: 0, agentCount: 1 });
    await orch.execute({ task: 'implement original request', mode: 'code', providers: { writer: provider, reviewer: provider } });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'implement original request' }, { role: 'assistant', content: 'REPAIRED ACTUAL' },
    ]);
  });
});

it('SOL08 provider failure does not invent a write from preexisting files', async () => {
  const { orch, root } = fixture();
  fs.writeFileSync(path.join(root, 'old.ts'), 'export const old = true;');
  const failed: LLMProvider = { complete: async () => { throw new Error('offline provider failed before any write'); } };
  const result = await orch.execute({ task: 'create new.ts', mode: 'code', providers: { writer: failed, reviewer: provider }, maxRetries: 0 });
  expect(result.status).toBe('error');
  expect(result.output).toContain('offline provider failed before any write');
  expect(result.output).not.toMatch(/File\(s\) written|files? (?:written|changed)/i);
  expect(fs.existsSync(path.join(root, 'new.ts'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'old.ts'), 'utf8')).toBe('export const old = true;');
});
