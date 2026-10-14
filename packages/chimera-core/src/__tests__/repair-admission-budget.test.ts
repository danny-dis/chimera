import { expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
it('does not admit verification repair after a restored task cap is exhausted', async () => {
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { clock: () => 1000 } as any);
  try {
    await orch.restoreState({ sessionId: 'saved', task: 'same task', mode: 'code', messages: [], events: [], costSpend: { writer: 1 },
      taskBudget: { task: 'same task', mode: 'code', costCap: 1, spendBaseline: 0, providerSpend: 1, deadlineMs: 100000 }, metadata: { status: 'active' } });
    const run = vi.spyOn(orch as any, 'executeRun').mockResolvedValue({ status: 'needs_user', output: 'verification failed', cost: 0, agentCount: 0,
      verification: { bundle: { evidences: [{ type: 'test_result', verdict: 'fail', description: 'node verifier', data: { exitCode: 1 } }] } } });
    const provider = { complete: vi.fn() };
    await orch.execute({ task: 'same task', mode: 'code', providers: { writer: provider, reviewer: provider } });
    expect(run).toHaveBeenCalledOnce();
  } finally { orch.dispose(); }
});
