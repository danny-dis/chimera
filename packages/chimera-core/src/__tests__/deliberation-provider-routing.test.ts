import { describe, expect, it, vi } from 'vitest';
import { SimpleModelRegistry, type ModelEntry } from '@chimera/providers';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

function entry(id: string, deprecated = false): ModelEntry {
  return { id, name: id, provider: 'mock', contextWindow: 8192, maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
    degradationThreshold: 0.5, tier: 'cheap', deprecated };
}

function provider(content: string) {
  return { complete: vi.fn<LLMProvider['complete']>(async () => ({ content, usage: { inputTokens: 1, outputTokens: 1 } })) };
}

describe('deliberation model ID routing', () => {
  it('runs the configured reviewer rather than calling the writer twice in duo', async () => {
    const registry = new SimpleModelRegistry([entry('old', true), entry('writer-model'), entry('reviewer-model'), entry('challenger-model')]);
    const writer = provider('Create hello.js. Verify by running node hello.js.');
    const reviewer = provider('Reviewed implementation: create hello.js and verify node hello.js prints hello.');
    const challenger = provider('Challenge');
    const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
    try {
      const result = await orchestrator.executeWithDeliberation('Plan a Node.js hello CLI with verification.', 'plan', { writer, reviewer, challenger }, 10, 'duo');
      expect(writer.complete).toHaveBeenCalledOnce();
      expect(reviewer.complete).toHaveBeenCalledOnce();
      expect(challenger.complete).not.toHaveBeenCalled();
      expect(reviewer.complete.mock.calls[0][0].some(message => message.content.includes('Create hello.js.'))).toBe(true);
      expect(result.output).toContain('Reviewed implementation');
      expect(result.degraded).toBe(false);
    } finally { orchestrator.dispose(); }
  });

  it('keeps role aliases, concrete challenger IDs, and unknown-ID fallback consistent', () => {
    const registry = new SimpleModelRegistry([entry('writer-model'), entry('reviewer-model'), entry('challenger-model')]);
    const providers = { writer: provider('writer'), reviewer: provider('reviewer'), challenger: provider('challenger') };
    const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
    try {
      const factory = (orchestrator as any).buildProviderFactory(providers);
      expect(factory('writer-model')).toBe(providers.writer);
      expect(factory('reviewer-model')).toBe(providers.reviewer);
      expect(factory('challenger-model')).toBe(providers.challenger);
      expect(factory('reviewer')).toBe(providers.reviewer);
      expect(factory('challenger')).toBe(providers.challenger);
      expect(factory('unknown')).toBe(providers.writer);
      const withoutChallenger = (orchestrator as any).buildProviderFactory({ writer: providers.writer, reviewer: providers.reviewer });
      expect(withoutChallenger('challenger-model')).toBe(providers.writer);
    } finally { orchestrator.dispose(); }
  });
});
