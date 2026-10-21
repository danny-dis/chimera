import { expect, it, vi } from 'vitest';
import { createFallbackProvider } from '../fallback-provider.js';
import type { ModelProvider } from '@chimera/providers';

it('uses the shared adapter for complete options and double-encoded tool arguments', async () => {
  const args = { path: 'sum.js', content: 'exports.add=(a,b)=>a+b;\n' };
  const usage = { inputTokens: 3, outputTokens: 2, cacheReadTokens: 1 };
  const complete = vi.fn(async () => ({ content: '', usage, finishReason: 'tool_calls',
    toolCalls: [{ id: 'write', name: 'write_file', arguments: JSON.stringify(JSON.stringify(args)) }] }));
  const provider = { complete, getModel: () => ({ id: 'test' }) } as unknown as ModelProvider;
  const options = { signal: new AbortController().signal, toolChoice: 'auto' as const, reasoning: { effort: 'low' as const }, maxTokens: 20 };
  const result = await createFallbackProvider([provider]).complete([], options);
  expect(complete).toHaveBeenCalledWith([], options);
  expect(result.toolCalls?.[0].arguments).toEqual(args);
  expect(result.usage).toEqual(usage);
});

it('preserves assistant tool-call and tool-result IDs on follow-up turns', async () => {
  const complete = vi.fn(async () => ({ content: 'done', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' }));
  const provider = { complete, getModel: () => ({ id: 'test' }) } as unknown as ModelProvider;
  await createFallbackProvider([provider]).complete([
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', arguments: { path: 'x' } }] },
    { role: 'tool', content: 'ok', toolResultId: 'a', toolName: 'read_file' },
  ] as any);
  expect(complete).toHaveBeenCalledWith([
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', arguments: '{"path":"x"}' }] },
    { role: 'tool', content: 'ok', toolResultId: 'a', toolName: 'read_file' },
  ], undefined);
});
