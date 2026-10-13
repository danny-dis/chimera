import { expect, it, vi } from 'vitest';
import { EventStream } from '../../event-stream.js';
import { runToolCalls } from '../tool-execution-helper.js';
it.each([
  ['Parameter validation failed: Expected object', 1],
  ['Permission denied for tool write_file', 1],
  ['Blocked by pre-tool-use hook', 1],
  ['EBUSY: resource busy', 2],
])('does not repeat a deterministic write failure: %s', async (error, attempts) => {
  const execute = vi.fn(async () => ({ success: false, error, duration: 0 }));
  const results = await runToolCalls({
    toolCalls: [{ id: 'a', name: 'write_file', arguments: { path: 'a.js', content: 'x' } }],
    toolExecutor: { execute }, eventStream: new EventStream(), workspaceRoot: process.cwd(), sessionId: 'retry-test',
  });
  expect(execute).toHaveBeenCalledTimes(attempts);
  expect(results[0].result.result).toMatchObject({ success: false, error });
});
