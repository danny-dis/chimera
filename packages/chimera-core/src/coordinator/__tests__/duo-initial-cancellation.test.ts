import { expect, it, vi } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { DuoExecutor } from '../duo-executor.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';

it.each(['before', 'during'])('owns cancellation %s the initial writer request', async timing => {
  const controller = new AbortController();
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  let release!: (result: { content: string }) => void;
  const pending = new Promise<{ content: string }>(resolve => { release = resolve; });
  let receivedSignal: unknown;
  const complete = vi.fn<LLMProvider['complete']>(async (_messages, options) => {
    receivedSignal = options?.signal;
    ready();
    return pending;
  });
  const reviewer = vi.fn<LLMProvider['complete']>(async () => ({ content: 'review' }));
  const executor = new DuoExecutor({ signal: controller.signal, readOnly: true, eventStream: new EventStream(), registry: new SimpleModelRegistry() });
  if (timing === 'before') controller.abort(new Error('cancelled'));
  const run = executor.executeWithAnalysis('Plan a CLI without editing files.', { modelA: 'writer', modelB: 'reviewer' }, id => ({ complete: id === 'writer' ? complete : reviewer }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (timing === 'during') {
      await started;
      controller.abort(new Error('cancelled'));
    }
    const result = await Promise.race([run, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('duo ignored cancellation')), 250);
    })]);
    expect(result.degraded).toBe(true);
    expect(result.output).toBe('');
    expect(reviewer).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1);
    if (timing === 'during') expect(receivedSignal).toBe(controller.signal);
  } finally {
    clearTimeout(timer);
    release({ content: 'late draft' });
    await run;
  }
});
