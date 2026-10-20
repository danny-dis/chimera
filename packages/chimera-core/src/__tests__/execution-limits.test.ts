import { expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
const providers = { writer: { complete: vi.fn() }, reviewer: { complete: vi.fn() } };
it.each([
  ['maxToolRounds', 0], ['maxToolRounds', 1001], ['maxToolRounds', 1.5],
  ['timeoutMs', 0], ['timeoutMs', Infinity], ['timeoutMs', 2147483648],
])('rejects invalid %s before executing the task', async (field, value) => {
  const orch = new SessionOrchestrator(new EventStream());
  const run = vi.spyOn(orch as any, 'executeRun').mockResolvedValue({ status: 'done', output: 'done', cost: 0, agentCount: 1 });
  try {
    await expect(orch.execute({ task: 'Create result.js', mode: 'code', providers, [field]: value } as any)).rejects.toThrow(field);
    expect(run).not.toHaveBeenCalled();
  } finally { orch.dispose(); }
});
it('admits an explicit task deadline and retains it when resuming', async () => {
  let now = 1000;
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { clock: () => now } as any);
  vi.spyOn(orch as any, 'executeRun').mockResolvedValue({ status: 'done', output: 'done', cost: 0, agentCount: 1 });
  try {
    const task = 'Create result.js';
    await orch.execute({ task, mode: 'code', providers, maxToolRounds: 100, timeoutMs: 30000 } as any);
    const saved = orch.exportState('limits', task, 'code');
    expect(saved.taskBudget.deadlineMs).toBe(now + 30000);
    now += 5000;
    await orch.restoreState(saved);
    await orch.execute({ task, mode: 'code', providers, timeoutMs: 90000 } as any);
    expect(orch.exportState('limits', task, 'code').taskBudget.deadlineMs).toBe(saved.taskBudget.deadlineMs);
  } finally { orch.dispose(); }
});
