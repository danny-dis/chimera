import { describe, it, expect } from 'vitest';
import { testProviderConnection } from '../commands/setup.js';
import type { ModelProvider, Message, CompletionResult, ModelInfo, ProviderCapabilities } from '@chimera/providers';

const CAPS: ProviderCapabilities = {
  sessionResume: false, mcp: false, hooks: false, skills: false, agents: false,
  toolRestrictions: false, structuredOutput: 'false', envInjection: false,
  costControl: false, effortControl: false, thinkingControl: false,
  fallbackModel: false, sandbox: false, nativeTools: false, streaming: true,
  vision: false, reasoning: false, functionCalling: false,
};

function fakeProvider(opts: { complete?: (p: Message[]) => Promise<CompletionResult>; neverResolves?: boolean }): ModelProvider {
  const info: ModelInfo = { id: 'x', name: 'x', provider: 'openai-compatible', contextWindow: 8192, maxOutputTokens: 4096 };
  const ok: CompletionResult = { content: 'ok', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
  return {
    complete: opts.neverResolves ? () => new Promise<CompletionResult>(() => {}) : (opts.complete ?? (async () => ok)),
    stream: async function* () {},
    getModel: () => info,
    getContextWindow: () => info.contextWindow,
    getMaxOutputTokens: () => info.maxOutputTokens,
    getCost: () => 0,
    getPricing: () => ({ inputPerMillion: 0, outputPerMillion: 0 }),
    getCapabilities: () => CAPS,
    supportsToolCalling: () => false,
    supportsStructuredOutput: () => false,
    supportsVision: () => false,
    supportsReasoning: () => false,
    countTokens: (t: string) => t.length,
    countTokensForMessages: () => 1,
  };
}

describe('testProviderConnection', () => {
  it('returns null on a successful completion', async () => {
    expect(await testProviderConnection(fakeProvider({}))).toBeNull();
  });

  it('returns the error message when complete() rejects', async () => {
    const p = fakeProvider({ complete: async () => { throw new Error('401 invalid key'); } });
    expect(await testProviderConnection(p)).toMatch(/401 invalid key/);
  });
});
