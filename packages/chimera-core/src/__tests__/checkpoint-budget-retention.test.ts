import { expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
const checkpoint = (costCap = 10, spent = 9, deadlineMs = 100000) => ({ sessionId: 'restart', task: 'Answer this question', mode: 'ask', messages: [], events: [], costSpend: { writer: spent },
  taskBudget: { task: 'Answer this question', mode: 'ask', costCap, spendBaseline: 0, providerSpend: spent, deadlineMs }, metadata: { status: 'active' } });
it.each([[10,9],[2,1.5]])('retains original task cap %s and spend on continuation', async (cap, spent) => {
  const now = () => 1000;
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { clock: now } as any);
  const complete = vi.fn(async () => { orch.getCostTracker().recordSpend('writer', cap - spent); return { content: 'answer', usage: { inputTokens: 0, outputTokens: 0 } }; });
  try {
    await orch.restoreState(checkpoint(cap,spent));
    const result = await orch.execute({ task: 'Answer this question', mode: 'ask', providers: { writer: { complete }, reviewer: { complete } } });
    expect(result.status).toBe('done');
    const saved = orch.exportState('restart', 'Answer this question', 'ask');
    expect(saved.taskBudget.costCap).toBe(cap);
    expect(saved.taskBudget.spendBaseline).toBe(0);
    expect(orch.getCostTracker().getTotalCost()).toBe(cap);
    await orch.restoreState(saved);
    await orch.execute({ task: 'Answer this question', mode: 'ask', providers: { writer: { complete }, reviewer: { complete } } });
    expect(complete).toHaveBeenCalledTimes(1);
  } finally { orch.dispose(); }
});
it('does not renew the task deadline on resume', async () => {
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { clock: () => 100001 } as any);
  const complete = vi.fn();
  try {
    await orch.restoreState(checkpoint());
    const result = await orch.execute({ task: 'Answer this question', mode: 'ask', providers: { writer: { complete }, reviewer: { complete } } });
    expect(result.status).not.toBe('done');
    expect(complete).not.toHaveBeenCalled();
  } finally { orch.dispose(); }
});
