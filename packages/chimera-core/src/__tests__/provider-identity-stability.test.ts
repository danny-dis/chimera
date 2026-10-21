import { expect, it, vi } from 'vitest';
import { SimpleModelRegistry, type ModelEntry } from '@chimera/providers';
import { EventStream } from '../event-stream.js';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { adaptProvider } from '../provider-adapter.js';
import { createAliasResolverFromConfig } from '../coordinator/alias-resolvers.js';

vi.mock('../coordinator/alias-resolvers.js', () => ({ createAliasResolverFromConfig: vi.fn() }));

const entry = (id: string): ModelEntry => ({ id, name: id, provider: 'controlled', contextWindow: 8192,
  maxOutputTokens: 1024, pricing: { inputPerMillion: 0, outputPerMillion: 0 },
  capabilities: { toolCalling: true, structuredOutput: true, vision: false, reasoning: false, parallelToolCalls: false },
  degradationThreshold: 0.5, tier: 'cheap' });

it('preserves provider model identity at the SDK adapter boundary', () => {
  const model = entry('configured-writer');
  const adapted = adaptProvider({ complete: vi.fn(), getModel: () => model } as any) as any;
  expect(adapted.getModel?.()).toEqual(model);
});

it('resolves concrete provider IDs independently of registry insertion order', async () => {
  const writer = { complete: vi.fn(), getModel: () => entry('configured-writer') };
  const reviewer = { complete: vi.fn(), getModel: () => entry('configured-reviewer') };
  const challenger = { complete: vi.fn(), getModel: () => entry('configured-challenger') };
  const registry = new SimpleModelRegistry(['unrelated', 'configured-challenger', 'configured-writer', 'configured-reviewer'].map(entry));
  const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
  try {
    const factory = (orchestrator as any).buildProviderFactory({ writer, reviewer, challenger });
    expect(factory('configured-writer')).toBe(writer);
    expect(factory('configured-reviewer')).toBe(reviewer);
    expect(factory('configured-challenger')).toBe(challenger);
    const config = (orchestrator as any).buildDeliberationConfig('Plan the implementation.', 'plan', { writer, reviewer, challenger }, 1, 'duo');
    expect(factory(config.modelA)).toBe(writer);
    expect(factory(config.modelB)).toBe(reviewer);
  } finally { await orchestrator.dispose(); }
});

it.each(['solo', 'trio', 'auto'] as const)('keeps same-model provider instances distinct through %s', async preset => {
  const usage = { inputTokens: 1, outputTokens: 1 };
  const writer = { getModel: () => entry('shared'), complete: vi.fn(async () => ({ usage, content: 'Implementation candidate for review.' })) };
  const reviewer = { getModel: () => entry('reviewer-model'), complete: vi.fn(async () => ({
    usage, content: JSON.stringify({ verdict: 'PASS', confidence: 0.99, findings: [] }),
  })) };
  const challenger = { getModel: () => entry('shared'), complete: vi.fn(async () => ({ usage, content: 'No additional issues found.' })) };
  const registry = new SimpleModelRegistry([entry('shared'), entry('reviewer-model')]);
  const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
  try {
    await orchestrator.execute({ task: 'Refactor the calculator module while preserving public behavior.', mode: 'code',
      preset, providers: { writer, reviewer, challenger }, costCap: 1 });
    expect(writer.complete).toHaveBeenCalled();
    if (preset === 'trio') {
      expect(reviewer.complete).toHaveBeenCalled();
      expect(challenger.complete).toHaveBeenCalled();
    } else expect(challenger.complete).not.toHaveBeenCalled();
  } finally { await orchestrator.dispose(); }
});

it('keeps configured role identity through guarded orchestration', async () => {
  const reply = (id: string, content: string) => adaptProvider({ getModel: () => entry(id),
    complete: vi.fn(async () => ({ content, usage: { inputTokens: 1, outputTokens: 1 } })),
  });
  const writer = reply('configured-writer', 'Create hello.js and verify it with node hello.js.');
  const reviewer = reply('configured-reviewer', 'Reviewed: create hello.js and run node hello.js to verify hello.');
  const review = vi.spyOn(reviewer, 'complete');
  const registry = new SimpleModelRegistry(['unrelated', 'configured-reviewer', 'configured-writer'].map(entry));
  const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
  try {
    const result = await orchestrator.execute({ task: 'Plan a Node.js hello CLI with verification.', mode: 'plan',
      preset: 'duo', providers: { writer, reviewer }, costCap: 1 });
    expect(review).toHaveBeenCalledOnce();
    expect(review.mock.calls[0][0].some(message => message.content.includes('Create hello.js'))).toBe(true);
    expect(result.output).toContain('Reviewed:');
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'deliberation_executed', preset: 'duo', degraded: false }));
  } finally { await orchestrator.dispose(); }
});

it('routes Auto review to the reviewer after preset aliases replace model IDs', async () => {
  const provider = (id: string) => ({ getModel: () => entry(id),
    complete: vi.fn(async () => ({ content: `Reviewed calculator module by ${id}.`, usage: { inputTokens: 1, outputTokens: 1 } })),
  });
  const defaults = { writer: provider('writer-original'), reviewer: provider('reviewer-original') };
  const writer = provider('writer-new'), reviewer = provider('reviewer-new');
  const resolve = vi.fn(async (alias: string) => alias === 'new-writer' ? writer : reviewer);
  vi.mocked(createAliasResolverFromConfig).mockReturnValue({ backend: 'dmr-x', resolve } as any);
  const registry = new SimpleModelRegistry(['writer-original', 'reviewer-original', 'writer-new', 'reviewer-new'].map(entry));
  const orchestrator = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry });
  orchestrator.setConfigBackend('http://configured.invalid/v1');
  try {
    const result = await orchestrator.execute({ task: 'Review calculator module boundaries.', mode: 'review',
      preset: 'auto', providers: defaults, presetAliases: { writer: 'new-writer', reviewer: 'new-reviewer' }, costCap: 1 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'auto_preset_selected', selectedPreset: 'duo' }));
    expect(resolve.mock.calls.map(call => call[0])).toEqual(['new-writer', 'new-reviewer']);
    expect(writer.complete).toHaveBeenCalled();
    expect(reviewer.complete).toHaveBeenCalled();
    expect(defaults.writer.complete).not.toHaveBeenCalled();
    expect(defaults.reviewer.complete).not.toHaveBeenCalled();
  } finally { await orchestrator.dispose(); }
});
