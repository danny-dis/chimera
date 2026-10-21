import { expect, it, vi } from 'vitest';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

it.each(['abort', 'deadline'] as const)('settles a signal-ignoring provider after %s and ignores its late result', async kind => {
  const events = new EventStream();
  const orch = new SessionOrchestrator(events);
  const controller = new AbortController();
  let markStarted!: () => void;
  let release!: (value: Awaited<ReturnType<LLMProvider['complete']>>) => void;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const response = new Promise<Awaited<ReturnType<LLMProvider['complete']>>>(resolve => { release = resolve; });
  const complete = vi.fn((_messages, _options) => { markStarted(); return response; });
  const reviewer = { complete: vi.fn() };
  const params = { task: 'Hello', mode: 'ask' as const, providers: { writer: { complete }, reviewer } };
  let settled = false;
  const execution = orch.execute({ ...params, signal: controller.signal, timeoutMs: kind === 'deadline' ? 1000 : 60000 })
    .then(result => { settled = true; return result; });
  try {
    await Promise.race([started, execution.then(() => { throw new Error('Execution settled before the provider started'); })]);
    if (kind === 'abort') controller.abort();
    else await new Promise(resolve => setTimeout(resolve, 1100));
    await new Promise(resolve => setImmediate(resolve));
    expect(settled, 'public execute must settle without waiting for a noncooperative provider').toBe(true);
    const result = await execution;
    expect(result.status).not.toBe('done');
    expect((orch as any)._executing).toBe(false);
    expect(reviewer.complete).not.toHaveBeenCalled();
    const next = await orch.execute({ ...params, providers: {
      writer: { complete: async () => ({ content: 'Fresh reply', usage: { inputTokens: 0, outputTokens: 0 } }) }, reviewer,
    } });
    const snapshot = JSON.stringify(events.getAll());
    release({ content: 'LATE_RESULT', usage: { inputTokens: 100, outputTokens: 100 } });
    await new Promise(resolve => setImmediate(resolve));
    expect(next.status).toBe('done');
    expect(JSON.stringify(events.getAll())).toBe(snapshot);
    expect(orch.getCostTracker().getTotalCost()).toBe(0);
  } finally {
    controller.abort();
    release({ content: 'cleanup', usage: { inputTokens: 0, outputTokens: 0 } });
    await execution;
    orch.dispose();
  }
}, 10000);
