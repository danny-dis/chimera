import { describe, it, expect, vi } from 'vitest';
import { FusionExecutor } from '../fusion-executor.js';
import { EventStream } from '../../event-stream.js';
import { ModelRegistry } from '../../../../chimera-providers/src/model-registry.js';
import type { LLMProvider } from '../../session-orchestrator.js';

describe('FusionExecutor', () => {
  it('executes a fusion task with a panel of 3 models and a judge', async () => {
    const eventStream = new EventStream();
    const registry = new ModelRegistry();
    const executor = new FusionExecutor({ eventStream, registry });

    const mockProvider: LLMProvider = {
      complete: vi.fn().mockImplementation(async (messages: any) => {
        const userMsg = messages[0].content;
        if (userMsg.includes('You are the judge')) {
          return { content: JSON.stringify({ finalResponse: 'Fused response', consensus: ['A'], conflicts: ['B'], uniqueInsights: ['C'], blindSpots: ['D'], confidence: 0.9 }) };
        }
        return { content: 'Mock response' };
      }),
    } as unknown as LLMProvider;

    const providerFactory = vi.fn().mockReturnValue(mockProvider);

    const config = {
      analysisModels: ['m1', 'm2', 'm3'],
      judgeModel: 'judge-m',
    };

    const output = await executor.execute('Research carbon taxes', config, providerFactory);

    expect(providerFactory).toHaveBeenCalledTimes(4); // 3 panels + 1 judge
    expect(output).toBe('Fused response');
  });
});
