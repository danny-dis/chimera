import { expect, it } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
it('restores checkpoint spending without double counting repeated restore', async () => {
  const orch = new SessionOrchestrator(new EventStream());
  try {
    const checkpoint = { sessionId: 'restored', costSpend: { writer: 4.5, reviewer: 1 }, metadata: { status: 'completed' } };
    await orch.restoreState(checkpoint);
    await orch.restoreState(checkpoint);
    expect(orch.getCostTracker().getTotalCost()).toBe(5.5);
    expect(orch.exportState('restored', 'task', 'code').costSpend).toEqual(checkpoint.costSpend);
  } finally { orch.dispose(); }
});
it.each([-1, Infinity, '2'])('refuses malformed checkpoint spending %s', async amount => {
  const orch = new SessionOrchestrator(new EventStream());
  try { await expect(orch.restoreState({ costSpend: { writer: amount } })).rejects.toThrow('checkpoint spend'); }
  finally { orch.dispose(); }
});
