import { it, expect, vi } from 'vitest';
import { adaptProvider } from '../provider-adapter.js';
import type { ModelProvider } from '@chimera/providers';

it('preserves cancellation, reasoning, cache usage and provider pricing', async () => {
  const signal = new AbortController().signal;
  const usage = { inputTokens: 20, outputTokens: 5, cacheReadTokens: 10, cacheWriteTokens: 2 };
  const pricing = { inputPerMillion: 2, outputPerMillion: 8 };
  const provider = {
    complete: vi.fn().mockResolvedValue({ content: 'done', usage }),
    getPricing: vi.fn().mockReturnValue(pricing),
    getCost: vi.fn().mockReturnValue(0.01),
  };
  const adapted = adaptProvider(provider as unknown as ModelProvider);
  const result = await adapted.complete([], { signal, reasoning: { effort: 'low' } });
  expect(provider.complete).toHaveBeenCalledWith([], expect.objectContaining({ signal, reasoning: { effort: 'low' } }));
  expect(result.usage).toEqual(usage);
  expect(adapted.getPricing?.()).toEqual(pricing);
  expect(adapted.getCost?.({ input: 20, output: 5 })).toBe(0.01);
});
