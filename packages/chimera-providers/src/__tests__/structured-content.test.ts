import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';

/**
 * Regression tests for structured (block-array) `message.content`.
 *
 * The OpenAI spec types `content` as a string, but meta-model gateways
 * (DMR-X `auto-*`) return an array of typed blocks. The provider used to cast
 * that array to `string`, so downstream sanitizers blew up with
 * "raw.trim is not a function" and a run failed with status `needs_user`.
 */

function makeProvider(): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    apiKey: 'test-key',
    baseUrl: 'http://127.0.0.1:9/v1',
    model: 'auto-coding',
  });
}

function mockResponse(message: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: 'req_test',
      choices: [{ index: 0, message, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }),
  } as unknown as Response;
}

describe('OpenAICompatibleProvider — structured content blocks', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns a string when content is a plain string (unchanged behavior)', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ role: 'assistant', content: '4' }));
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(result.content).toBe('4');
  });

  it('flattens a text block array into a string', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      }),
    );
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(result.content).toBe('Hello world');
    expect(typeof result.content).toBe('string');
  });

  it('excludes thinking blocks from visible content and surfaces them as reasoning', async () => {
    // This is the exact shape observed from the DMR-X gateway.
    fetchSpy.mockResolvedValue(
      mockResponse({
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: [{ type: 'text', text: 'Okay, 2+2...' }] },
          { type: 'text', text: '4' },
        ],
      }),
    );
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(result.content).toBe('4');
    expect(result.reasoning).toContain('Okay, 2+2');
  });

  it('content is always trimmable (the actual crash that was reported)', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        role: 'assistant',
        content: [{ type: 'text', text: '  padded  ' }],
      }),
    );
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(() => result.content.trim()).not.toThrow();
    expect(result.content.trim()).toBe('padded');
  });

  it('does not throw when a thinking-only response has no visible text', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({
        role: 'assistant',
        content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'pondering' }] }],
      }),
    );
    // Reasoning counts as output, so this must not be rejected as empty.
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(result.content).toBe('');
    expect(result.reasoning).toContain('pondering');
  });

  it('handles null content without throwing', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ role: 'assistant', content: null, tool_calls: [
        { id: 'c1', function: { name: 'ping', arguments: '{}' } },
      ] }),
    );
    const result = await makeProvider().complete([{ role: 'user', content: 'x' }]);
    expect(result.content).toBe('');
    expect(result.toolCalls?.[0]?.name).toBe('ping');
  });
});
