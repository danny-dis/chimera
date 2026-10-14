import { afterEach, expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const host = new SessionOrchestrator(new EventStream());
  await host.restoreState({ sessionId: 'resumed', task: 'implement addition', mode: 'code', costSpend: {}, metadata: { status: 'active' },
    taskBudget: { task: 'implement addition', mode: 'code', costCap: 10, spendBaseline: 0, providerSpend: 0, deadlineMs: Date.now() + 300000 },
    verificationContract: { commands: ['node verify.cjs'], generatedOutputs: ['dist'] } });
  const run = vi.spyOn(host as any, 'executeRun').mockResolvedValue({ status: 'done', output: 'verified', cost: 0, agentCount: 1, events: [] });
  const provider = { complete: vi.fn() };
  const params = { task: 'implement addition', mode: 'code' as const, providers: { writer: provider, reviewer: provider } };
  return { host, run, params };
}
it('retains saved verification commands and output allowances when omitted on resume', async () => {
  const { host, run, params } = await fixture();
  try {
    await host.execute(params);
    expect(run.mock.calls[0][0]).toMatchObject({ verificationCommands: ['node verify.cjs'], verificationOutputs: ['dist'] });
  } finally { host.dispose(); }
});
it.each([{ verificationCommands: ['node -e "process.exit(0)"'] }, { verificationCommands: [] }, { verificationOutputs: ['.'] }, { verificationOutputs: [] }])('rejects replacement resume verification contract %j before admission', async replacement => {
  const { host, run, params } = await fixture();
  try {
    await expect(host.execute({ ...params, ...replacement })).rejects.toThrow(/resumed verification/i);
    expect(run).not.toHaveBeenCalled();
    expect(host.exportState('resumed', params.task, params.mode).verificationContract).toEqual({ commands: ['node verify.cjs'], generatedOutputs: ['dist'] });
  } finally { host.dispose(); }
});
