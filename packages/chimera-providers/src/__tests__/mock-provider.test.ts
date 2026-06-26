import { describe, it, expect, vi } from 'vitest';
import { MockProvider, createDefaultMockProvider } from '../providers/mock.js';
import type { Message } from '../types/provider.js';

const userMsg = (content: string): Message => ({ role: 'user', content });

describe('MockProvider', () => {
  describe('complete()', () => {
    it('returns a default echo response when no custom response given', async () => {
      const provider = new MockProvider();
      const result = await provider.complete([userMsg('hello there')]);

      expect(result.content).toContain('Mock response');
      expect(result.content).toContain('hello there');
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.finishReason).toBe('end_turn');
    });

    it('returns the static response when given one', async () => {
      const provider = new MockProvider({ response: 'CUSTOM' });
      const result = await provider.complete([userMsg('any')]);
      expect(result.content).toBe('CUSTOM');
    });

    it('invokes a function response with the messages', async () => {
      const spy = vi.fn((msgs: Message[]) => `received ${msgs.length} messages`);
      const provider = new MockProvider({ response: spy });
      const result = await provider.complete([userMsg('a'), userMsg('b')]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('received 2 messages');
    });

    it('attaches tool calls when configured', async () => {
      const provider = new MockProvider({
        response: 'ok',
        toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: '{"path":"x.ts"}' }],
      });
      const result = await provider.complete([userMsg('read x.ts')]);
      expect(result.toolCalls).toEqual([
        { id: 'tc-1', name: 'read_file', arguments: '{"path":"x.ts"}' },
      ]);
      expect(result.finishReason).toBe('tool_use');
    });

    it('throws when failOnCall is set and the call count matches', async () => {
      const provider = new MockProvider({ failOnCall: 2 });
      await provider.complete([userMsg('a')]);
      await expect(provider.complete([userMsg('b')])).rejects.toThrow('MockProvider injected failure');
    });

    it('waits the configured latency before resolving', async () => {
      const provider = new MockProvider({ latencyMs: 50 });
      const start = Date.now();
      await provider.complete([userMsg('x')]);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('stream()', () => {
    it('emits content split by word when streamChunks is true', async () => {
      const provider = new MockProvider({ response: 'one two three', streamChunks: true });
      const chunks: string[] = [];
      for await (const chunk of provider.stream([userMsg('a')])) {
        if (chunk.content) chunks.push(chunk.content);
      }
      expect(chunks.join('')).toBe('one two three');
    });

    it('emits a single content chunk when streamChunks is false', async () => {
      const provider = new MockProvider({ response: 'hello', streamChunks: false });
      const chunks: string[] = [];
      for await (const chunk of provider.stream([userMsg('a')])) {
        if (chunk.content) chunks.push(chunk.content);
      }
      expect(chunks).toEqual(['hello']);
    });

    it('emits a final usage chunk', async () => {
      const provider = new MockProvider({ response: 'ok' });
      const finalChunk = await provider.stream([userMsg('a')]).next();
      // Iterate to last yield
      let last: unknown = null;
      for await (const c of provider.stream([userMsg('a')])) last = c;
      expect(last).toMatchObject({ finishReason: 'end_turn' });
      expect((last as { usage?: unknown }).usage).toBeDefined();
    });
  });

  describe('model info', () => {
    it('advertises the configured model and provider', () => {
      const provider = new MockProvider({ provider: 'mock', model: 'unit-test-model' });
      expect(provider.getModel().id).toBe('unit-test-model');
      expect(provider.getModel().provider).toBe('mock');
      expect(provider.getContextWindow()).toBeGreaterThan(0);
      expect(provider.getMaxOutputTokens()).toBeGreaterThan(0);
    });

    it('createDefaultMockProvider returns a usable instance', () => {
      const provider = createDefaultMockProvider();
      expect(provider).toBeInstanceOf(MockProvider);
      expect(provider.getModel().id).toBe('mock-default');
    });
  });

  describe('cost', () => {
    it('returns 0 cost for the default (free) provider', () => {
      const provider = new MockProvider();
      expect(provider.getPricing().inputPerMillion).toBe(0);
      expect(provider.getCost({ input: 1000, output: 1000 })).toBe(0);
    });

    it('returns non-zero cost when pricing is set', () => {
      const provider = new MockProvider({
        pricing: { inputPerMillion: 3, outputPerMillion: 15 },
      });
      const cost = provider.getCost({ input: 1_000_000, output: 1_000_000 });
      expect(cost).toBeCloseTo(18); // 3 + 15
    });
  });

  describe('capabilities', () => {
    it('advertises tool calling and structured output, but not vision/reasoning', () => {
      const provider = new MockProvider();
      expect(provider.supportsToolCalling()).toBe(true);
      expect(provider.supportsStructuredOutput()).toBe(true);
      expect(provider.supportsVision()).toBe(false);
      expect(provider.supportsReasoning()).toBe(false);
    });
  });

  describe('token counting', () => {
    it('returns 0 for empty text', () => {
      const provider = new MockProvider();
      expect(provider.countTokens('')).toBe(0);
    });

    it('returns a positive number for non-empty text', () => {
      const provider = new MockProvider();
      expect(provider.countTokens('hello world')).toBeGreaterThan(0);
    });

    it('sums tokens across messages and tool calls', () => {
      const provider = new MockProvider();
      const total = provider.countTokensForMessages([
        { role: 'system', content: 'sys prompt' },
        { role: 'user', content: 'user message' },
        {
          role: 'assistant',
          content: 'ok',
          toolCalls: [{ id: 'tc-1', name: 'tool_x', arguments: '{"a":1}' }],
        },
      ]);
      // It should be strictly greater than either single message alone.
      expect(total).toBeGreaterThan(provider.countTokens('user message'));
    });
  });
});
