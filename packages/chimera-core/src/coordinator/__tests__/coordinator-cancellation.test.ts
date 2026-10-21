import { expect, it, vi } from 'vitest';
import { CoordinatorEngine } from '../coordinator-engine.js';
import { EventStream } from '../../event-stream.js';

it('rejects cancelled decomposition even when the provider ignores abort', async () => {
  const ac = new AbortController();
  let received: AbortSignal | undefined;
  let release!: (value: any) => void;
  const complete = vi.fn((_messages, options) => {
    received = options?.signal;
    return new Promise<any>(resolve => { release = resolve; });
  });
  const engine = new CoordinatorEngine({ provider: { complete }, eventStream: new EventStream(), toolDeps: { signal: ac.signal } });
  const running = engine.execute('implement a feature');
  const rejection = expect(running).rejects.toThrow(/cancelled/);
  ac.abort(new Error('cancelled'));
  release({ content: '{"subTasks":[]}', usage: { inputTokens: 1, outputTokens: 1 } });
  await rejection; expect(received).toBe(ac.signal); expect(complete).toHaveBeenCalledOnce();
});

it('does not start synthesis after child cancellation', async () => {
  const ac = new AbortController();
  const complete = vi.fn();
  const engine = new CoordinatorEngine({ provider: { complete }, eventStream: new EventStream(), toolDeps: { signal: ac.signal } });
  (engine as any).spawner.executeAll = vi.fn(async () => {
    ac.abort(new Error('cancelled'));
    return ['a', 'b'].map(subTaskId => ({ subTaskId, status: 'success', output: 'done', tokensUsed: 1, durationMs: 1 }));
  });
  await expect(engine.execute('task', '', ['a', 'b'].map(id => ({ id, description: id, dependencies: [], context: '', estimatedTokens: 1, provider: { complete } })))).resolves.toMatchObject({ resolved: false });
  expect(complete).not.toHaveBeenCalled();
});
