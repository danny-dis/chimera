import { expect, it, vi } from 'vitest';
import { EventStream } from '../../event-stream.js';
import { DeliberationEngine } from '../deliberation/engine.js';
it('forwards caller cancellation into the direct merge aggregator', async () => {
  const controller = new AbortController();
  let seen: AbortSignal | undefined;
  const complete = vi.fn(async (_messages, options) => {
    seen = options?.signal;
    return { content: '{"mergedOutput":"combined","resolved":true}', usage: { inputTokens: 1, outputTokens: 1 } };
  });
  const engine = new DeliberationEngine({ eventStream: new EventStream(), registry: {} as any, signal: controller.signal, providerFactory: () => ({ complete }) });
  await engine.run({ mode: 'merge', task: 'combine implementation results', mergeModel: 'configured', subTaskResults: ['a', 'b'].map(subTaskId => ({ subTaskId, status: 'success', output: subTaskId, tokensUsed: 1, durationMs: 1 })) });
  expect(complete).toHaveBeenCalledOnce();
  expect(seen).toBe(controller.signal);
});
