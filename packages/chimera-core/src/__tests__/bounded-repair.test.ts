import { describe, expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

const providers = { writer: { complete: vi.fn() }, reviewer: { complete: vi.fn() } };
const outcome = (status = 'needs_user', exitCode?: number) => ({ status, output: status, cost: 1, agentCount: 1, events: [], verification: { verified: false, bundle: { evidences: exitCode === undefined ? [] : [{ type: 'test_result', verdict: 'fail', description: 'caller check', data: { exitCode } }] } } });
describe('bounded verification repair and terminal state', () => {
  it('repairs at most once and retains the absolute deadline and remaining budget', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const run = vi.spyOn(orch as any, 'executeRun').mockResolvedValueOnce(outcome()).mockResolvedValueOnce(outcome());
    run.mockReset().mockResolvedValue(outcome('needs_user', 1));
    const result = await orch.execute({ task: 'fix', mode: 'code', providers, costCap: 10 });
    expect(run).toHaveBeenCalledTimes(2);
    const first = run.mock.calls[0][0] as any;
    const second = run.mock.calls[1][0] as any;
    expect(second.signal).toBe(first.signal);
    expect(second.costCap).toBe(10 - outcome().cost);
    expect(first.signal.aborted).toBe(true);
    expect(result.status).toBe('needs_user');
    expect(orch.getState().status).toBe('needs_user');
    expect(result.events.at(-1)).toMatchObject({ type: 'final_response', status: result.status });
    expect(result.events.filter(event => event.type === 'final_response')).toHaveLength(1);
  });
  it.each([{ result: outcome(), costCap: 10 }, { result: outcome('needs_user', 1), costCap: 1 }, { result: outcome('error', 1), costCap: 10 }])('does not retry missing/denied evidence, exhausted budget or errors', async ({ result, costCap }) => {
    const orch = new SessionOrchestrator(new EventStream());
    const run = vi.spyOn(orch as any, 'executeRun').mockResolvedValue(result);
    await orch.execute({ task: 'fix', mode: 'code', providers, costCap });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('does not repair after cancellation', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const controller = new AbortController();
    const run = vi.spyOn(orch as any, 'executeRun').mockImplementation(async () => { controller.abort(); return outcome('needs_user', 1); });
    await orch.execute({ task: 'fix', mode: 'code', providers, signal: controller.signal });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
