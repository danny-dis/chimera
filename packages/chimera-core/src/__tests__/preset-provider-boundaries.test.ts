import { afterEach, expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { createAliasResolverFromConfig } from '../coordinator/alias-resolvers.js';
vi.mock('../coordinator/alias-resolvers.js', () => ({ createAliasResolverFromConfig: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const usage = { inputTokens: 10, outputTokens: 5 };
const defaults = { writer: { complete: vi.fn(async () => ({ content: 'configured', usage })) },
  reviewer: { complete: vi.fn(async () => ({ content: 'review', usage })) } };
it('never replaces direct configured providers with an implicit local gateway', async () => {
  const orch = new SessionOrchestrator();
  try {
    expect(await (orch as any).resolvePresetProviders({ writer: 'auto' }, defaults)).toBe(defaults);
    expect(createAliasResolverFromConfig).not.toHaveBeenCalled();
  } finally { orch.dispose(); }
});
it('resolves role-to-alias mappings and adapts SDK tool arguments before dispatch', async () => {
  const raw = { complete: vi.fn(async () => ({ content: '', usage, toolCalls: [
    { id: 'write', name: 'write_file', arguments: JSON.stringify(JSON.stringify({ path: 'sum.js', content: 'exports.add=(a,b)=>a+b;' })) },
  ] })), getCost: () => 0.01 };
  const resolve = vi.fn(async () => raw);
  vi.mocked(createAliasResolverFromConfig).mockReturnValue({ backend: 'dmr-x', resolve } as any);
  const orch = new SessionOrchestrator();
  orch.setConfigBackend('http://configured.invalid/v1');
  try {
    const selected = await (orch as any).resolvePresetProviders({ writer: 'auto-coding', reviewer: 'auto-fast' }, defaults);
    expect(resolve.mock.calls.map(call => call[0])).toEqual(['auto-coding', 'auto-fast']);
    expect((await selected.writer.complete([])).toolCalls[0].arguments).toEqual({ path: 'sum.js', content: 'exports.add=(a,b)=>a+b;' });
    expect(selected.writer.getCost({ input: 10, output: 5 })).toBe(0.01);
  } finally { orch.dispose(); }
});
it('applies the run cancellation guard to dynamically resolved providers', async () => {
  const parent = new AbortController();
  let received: AbortSignal | undefined;
  const raw = { complete: vi.fn(async (_messages, options) => {
    received = options?.signal; parent.abort('stop'); return { content: 'late', usage };
  }), getCost: () => 0.01 };
  vi.mocked(createAliasResolverFromConfig).mockReturnValue({ backend: 'dmr-x', resolve: async () => raw } as any);
  const orch = new SessionOrchestrator(undefined, undefined, undefined, undefined, { registry: {} } as any);
  orch.setConfigBackend('http://configured.invalid/v1');
  vi.spyOn(orch as any, 'executeWithDeliberation').mockImplementation(async () => {
    const selected = await (orch as any).resolvePresetProviders({ writer: 'auto-coding' }, defaults);
    await selected.writer.complete([]);
    return { output: 'late', mode: 'solo', analysis: { confidence: 1 }, totalCostUsd: 0, totalTokens: 15, durationMs: 0, degraded: false };
  });
  try {
    const result = await orch.execute({ task: 'inspect module boundaries', mode: 'review', providers: defaults, signal: parent.signal });
    expect(received?.aborted).toBe(true);
    expect(result.status).not.toBe('done');
    expect(result.cost).toBeGreaterThanOrEqual(0.01);
  } finally { orch.dispose(); }
});
