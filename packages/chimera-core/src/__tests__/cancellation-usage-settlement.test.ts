import { afterEach, expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { adaptProvider } from '../provider-adapter.js';
afterEach(() => vi.restoreAllMocks());
const usage = { inputTokens: 10, outputTokens: 5 };
const answer = { content: 'answer', usage };
const provider = () => ({ complete: vi.fn(async () => answer), getCost: () => 0.01 });
const deliberation = { output: 'answer', mode: 'solo', analysis: { confidence: 1 }, totalCostUsd: 0, totalTokens: 15, durationMs: 0, degraded: false, needsUserEscalation: true };

it('accepted response charges each ledger once and downstream CostTracker once', async () => {
  const writer = provider();
  const orch = new SessionOrchestrator();
  try {
    const result = await orch.execute({ task: 'Hello', mode: 'ask', providers: { writer, reviewer: provider() } });
    expect(result.status).toBe('done');
    expect(writer.complete).toHaveBeenCalledOnce();
    expect(result.cost).toBe(0.01);
    expect((orch as any)._completion.providerSpend).toBe(0.01);
    expect((orch as any)._taskBudget.providerSpend).toBe(0.01);
    expect(orch.getCostTracker().getTotalCost()).toBe(0.01);
  } finally { orch.dispose(); }
});

it('fulfilled usage still closes admission at the unchanged task cap', async () => {
  const writer = provider();
  const orch = new SessionOrchestrator(undefined, undefined, undefined, undefined, { registry: {} } as any);
  let first: any; let rejection: any;
  vi.spyOn(orch as any, 'executeWithDeliberation').mockImplementation(async (_task, _mode, guarded: any) => {
    first = await guarded.writer.complete([]);
    try { await guarded.writer.complete([]); } catch (error) { rejection = error; }
    return deliberation;
  });
  try {
    const result = await orch.execute({ task: 'inspect module boundaries', mode: 'review', costCap: 0.01, providers: { writer, reviewer: provider() } });
    expect(first).toEqual(answer);
    expect(String(rejection)).toMatch(/Budget exceeded/);
    expect(writer.complete).toHaveBeenCalledOnce();
    expect(result.cost).toBe(0.01);
    expect((orch as any)._completion.providerSpend).toBe(0.01);
    expect((orch as any)._taskBudget.providerSpend).toBe(0.01);
  } finally { orch.dispose(); }
});

it('provider rejection keeps its identity and does not record fulfilled usage', async () => {
  const failure = new Error('provider failure');
  const writer = { ...provider(), complete: vi.fn(async () => { throw failure; }) };
  const orch = new SessionOrchestrator(undefined, undefined, undefined, undefined, { registry: {} } as any);
  let caught: any;
  vi.spyOn(orch as any, 'executeWithDeliberation').mockImplementation(async (_task, _mode, guarded: any) => {
    try { await guarded.writer.complete([]); } catch (error) { caught = error; }
    return deliberation;
  });
  try {
    await orch.execute({ task: 'inspect module boundaries', mode: 'review', providers: { writer, reviewer: provider() } });
    expect(caught).toBe(failure);
    expect((orch as any)._completion.providerSpend).toBe(0);
    expect((orch as any)._taskBudget.providerSpend).toBe(0);
    expect(orch.getCostTracker().getTotalCost()).toBe(0);
  } finally { orch.dispose(); }
});

it.each(['fulfill', 'reject'])('cancel settles before a late %s and preserves the new run', async outcome => {
  const parent = new AbortController();
  let started!: () => void; let settle!: (value: any) => void; let fail!: (error: Error) => void;
  const admitted = new Promise<void>(resolve => { started = resolve; });
  const rawPromise = new Promise<any>((resolve, reject) => { settle = resolve; fail = reject; });
  let received: AbortSignal | undefined;
  const raw = { complete: vi.fn((_messages, options) => { received = options?.signal; started(); return rawPromise; }), getCost: () => 0.01 };
  const orch = new SessionOrchestrator();
  const firstRun = orch.execute({ task: 'Hello', mode: 'ask', providers: { writer: adaptProvider(raw as any), reviewer: provider() }, signal: parent.signal });
  try {
    await admitted;
    const oldCompletion = (orch as any)._completion;
    const oldBudget = (orch as any)._taskBudget;
    const reason = new Error('stop original run');
    parent.abort(reason);
    const result = await firstRun;
    expect(received?.aborted).toBe(true);
    expect(received?.reason).toBe(reason);
    expect(result.status).not.toBe('done');
    expect(result.cost).toBe(0);
    expect((orch as any)._executing).toBe(false);
    let secondStarted!: () => void; let secondSettle!: (value: any) => void;
    const secondAdmitted = new Promise<void>(resolve => { secondStarted = resolve; });
    const secondPromise = new Promise<any>(resolve => { secondSettle = resolve; });
    const nextWriter = { complete: vi.fn(() => { secondStarted(); return secondPromise; }), getCost: () => 0.02 };
    const secondRun = orch.execute({ task: 'Hello again', mode: 'ask', providers: { writer: nextWriter, reviewer: provider() } });
    try {
      await secondAdmitted;
      const nextCompletion = (orch as any)._completion;
      const nextBudget = (orch as any)._taskBudget;
      expect(nextCompletion).not.toBe(oldCompletion);
      expect(nextBudget).not.toBe(oldBudget);
      if (outcome === 'fulfill') settle({ ...answer, toolCalls: [{ id: 'late', name: 'write_file', arguments: '{"path":"late.js"}' }] });
      else fail(new Error('late provider failure'));
      await rawPromise.catch(() => {});
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(oldCompletion.providerSpend).toBe(outcome === 'fulfill' ? 0.01 : 0);
      expect(oldBudget.providerSpend).toBe(outcome === 'fulfill' ? 0.01 : 0);
      expect(oldCompletion.pendingTools.size).toBe(0);
      expect(nextCompletion.providerSpend).toBe(0);
      expect(nextBudget.providerSpend).toBe(0);
      expect(nextCompletion.pendingTools.size).toBe(0);
      expect(nextCompletion.stopReason).toBeUndefined();
      expect(nextCompletion.signal.aborted).toBe(false);
      expect(orch.getCostTracker().getTotalCost()).toBe(0);
      secondSettle(answer);
      const second = await secondRun;
      expect(second.status).toBe('done');
      expect(second.cost).toBe(0.02);
      expect(nextCompletion.providerSpend).toBe(0.02);
      expect(nextBudget.providerSpend).toBe(0.02);
      expect(orch.getCostTracker().getTotalCost()).toBe(0.02);
    } finally { secondSettle(answer); await secondRun.catch(() => {}); }
  } finally { settle(answer); await firstRun.catch(() => {}); orch.dispose(); }
});
