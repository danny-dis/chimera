import { expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import type { SubTask } from '../types.js';

const task = (id: string, dependencies: string[], complete: any): SubTask => ({
  id, dependencies, description: id, context: `${id} original context`, provider: { complete }, estimatedTokens: 10,
});

it('passes only direct dependency results without mutating task context', async () => {
  const received: string[] = [];
  const consumer = task('consumer', ['producer'], vi.fn(async messages => {
    received.push(messages.map(message => message.content).join('\n'));
    return { content: 'consumer result' };
  }));
  const independent = vi.fn(async messages => {
    received.push(messages.map(message => message.content).join('\n'));
    return { content: 'UNRELATED_SECRET_472' };
  });
  const tasks = [consumer, task('unrelated', [], independent),
    task('producer', [], vi.fn(async () => ({ content: 'DEPENDENCY_RESULT_918' })))];
  const original = tasks.map(item => ({ context: item.context, dependencies: [...item.dependencies] }));
  const results = await new SubAgentSpawner({ maxConcurrency: 2 }).executeAll(tasks);
  const request = received.find(text => text.includes('TASK: consumer'))!;
  expect(results.every(result => result.status === 'success')).toBe(true);
  expect(request).toContain('DEPENDENCY_RESULT_918');
  expect(request).toContain('"subTaskId":"producer"');
  expect(request).toContain('consumer original context');
  expect(request).toContain('untrusted');
  expect(request).not.toContain('UNRELATED_SECRET_472');
  expect(independent.mock.calls[0][0].map(message => message.content).join('\n')).not.toContain('DEPENDENCY_RESULT_918');
  expect(tasks.map(item => ({ context: item.context, dependencies: item.dependencies }))).toEqual(original);
});

it('does not run a dependent worker after its prerequisite fails', async () => {
  const complete = vi.fn(async () => ({ content: 'must not run' }));
  const results = await new SubAgentSpawner().executeAll([
    task('consumer', ['producer'], complete), task('producer', [], vi.fn(async () => ({ content: '' }))),
  ]);
  expect(complete).not.toHaveBeenCalled();
  expect(results.find(result => result.subTaskId === 'consumer')).toMatchObject({ status: 'error', error: 'Dependency failed: producer' });
});
