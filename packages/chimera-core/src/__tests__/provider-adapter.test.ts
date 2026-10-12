import { describe, expect, it, vi } from 'vitest';
import { adaptProvider } from '../provider-adapter.js';

describe('shared provider adapter', () => {
  it('preserves options, both tool-call shapes, result IDs/names, usage and pricing', async () => {
    const usage = { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4 };
    const provider = {
      complete: vi.fn().mockResolvedValue({ content: 'ok', usage }),
      getCost: vi.fn().mockReturnValue(0.1),
      getPricing: vi.fn().mockReturnValue({ inputPerMillion: 1, outputPerMillion: 2 }),
    };
    const adapted = adaptProvider(provider);
    const options = { signal: new AbortController().signal, reasoning: { effort: 'low' as const } };
    const messages = [
      { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', arguments: { path: 'x' } }] },
      { role: 'tool', content: 'ok', toolResultId: 'a', toolName: 'read_file' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'b', function: { name: 'read_file', arguments: '{"path":"y"}' } }] },
      { role: 'tool', content: 'ok', tool_call_id: 'b', name: 'read_file' },
    ];
    expect((await adapted.complete(messages, options)).usage).toEqual(usage);
    expect(provider.complete).toHaveBeenCalledWith([
      { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', arguments: '{"path":"x"}' }] },
      { role: 'tool', content: 'ok', toolResultId: 'a', toolName: 'read_file' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'b', name: 'read_file', arguments: '{"path":"y"}' }] },
      { role: 'tool', content: 'ok', toolResultId: 'b', toolName: 'read_file' },
    ], options);
    expect(adapted.getCost?.({ input: 1, output: 2 })).toBe(0.1);
    expect(adapted.getPricing?.()).toEqual({ inputPerMillion: 1, outputPerMillion: 2 });
  });

  it('preserves tool metadata carried inside the actual result envelope', async () => {
    const provider = { complete: vi.fn().mockResolvedValue({ content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }) };
    const content = JSON.stringify({ toolCallId: 'a', toolName: 'read_file', result: 'ok' });
    await adaptProvider(provider).complete([{ role: 'tool', content, tool_call_id: 'a' }] as any);
    expect(provider.complete).toHaveBeenCalledWith([{ role: 'tool', content, toolResultId: 'a', toolName: 'read_file' }], undefined);
  });

  it.each(['not json', '[]', 'null', '1'])('rejects malformed tool arguments without dispatch: %s', async (argumentsText) => {
    const provider = { complete: vi.fn().mockResolvedValue({ content: '', usage: { inputTokens: 1, outputTokens: 1 }, toolCalls: [{ id: 'a', name: 'write_file', arguments: argumentsText }] }) };
    await expect(adaptProvider(provider).complete([])).rejects.toThrow('Invalid tool-call arguments');
  });
});
