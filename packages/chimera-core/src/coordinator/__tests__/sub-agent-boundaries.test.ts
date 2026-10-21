import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import type { SubTask } from '../types.js';

const provider = () => ({ complete: vi.fn(async () => ({ content: 'done' })) });
const task = (id: string, dependencies: string[] = []): SubTask => ({
  id, dependencies, description: id, context: '', provider: provider(), estimatedTokens: 10,
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('sub-agent admission boundaries', () => {
  it.each([
    { label: 'missing dependency', tasks: [task('a', ['missing'])], error: /missing dependency/i },
    { label: 'cycle', tasks: [task('a', ['b']), task('b', ['a'])], error: /cycle/i },
    { label: 'duplicate id', tasks: [task('a'), task('a')], error: /duplicate/i },
  ])('rejects $label before invoking any provider', async ({ tasks, error }) => {
    vi.useFakeTimers();
    const run = new SubAgentSpawner().executeAll(tasks);
    const bounded = Promise.race([run, new Promise(resolve => setTimeout(() => resolve('still waiting'), 10))]);
    const check = expect(bounded).rejects.toThrow(error);
    await Promise.all([check, vi.advanceTimersByTimeAsync(10)]);
    for (const item of tasks) expect(item.provider.complete).not.toHaveBeenCalled();
  });
});
