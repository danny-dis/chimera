import { expect, it } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
it('does not mix spending between different restored sessions', async () => {
  const orch = new SessionOrchestrator(new EventStream());
  try {
    await orch.restoreState({ sessionId: 'A', task: 'A', mode: 'code', costSpend: { writer: 9 } });
    await orch.restoreState({ sessionId: 'B', task: 'B', mode: 'code', costSpend: { reviewer: 9 }, taskBudget: { task: 'B', mode: 'code', costCap: 10, spendBaseline: 0, providerSpend: 9, deadlineMs: Date.now() + 60000 } });
    expect(orch.getCostTracker().getSpendByProvider()).toEqual({ reviewer: 9 });
  } finally { orch.dispose(); }
});
it('leaves accounting and session unchanged after any invalid checkpoint entry', async () => {
  const orch = new SessionOrchestrator(new EventStream());
  try {
    await orch.restoreState({ sessionId: 'A', task: 'A', mode: 'code', costSpend: { writer: 2 } });
    await expect(orch.restoreState({ sessionId: 'B', costSpend: { writer: 4, reviewer: -1 } })).rejects.toThrow('checkpoint spend');
    expect(orch.getCostTracker().getSpendByProvider()).toEqual({ writer: 2 });
    expect((orch as any)._sessionId).toBe('A');
    await expect(orch.restoreState({ sessionId: 'B', task: 'B', mode: 'code', costSpend: { writer: 1 }, taskBudget: { task: 'B', mode: 'code', costCap: 10, spendBaseline: 20, providerSpend: 1, deadlineMs: Date.now() + 60000 } })).rejects.toThrow('baseline');
    expect((orch as any)._sessionId).toBe('A');
    expect(orch.getCostTracker().getSpendByProvider()).toEqual({ writer: 2 });
  } finally { orch.dispose(); }
});
