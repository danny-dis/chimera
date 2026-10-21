import { expect, it, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import { SimpleModelRegistry } from '@chimera/providers';
it('remaps a file-producing auto/swarm request after operational mode resolution', async () => {
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry: new SimpleModelRegistry() });
  const provider = { getModelId: () => 'controlled', getModel: () => ({ provider: 'controlled', model: 'controlled' }), complete: vi.fn() };
  const dispatch = vi.spyOn(orch, 'executeWithDeliberation').mockResolvedValue({
    mode: 'trio', output: 'Controlled route probe only.', analysis: { confidence: 1 },
    totalTokens: 0, totalCostUsd: 0, durationMs: 0, degraded: false,
  } as any);
  try {
    await orch.execute({ task: 'Implement calc.js with a calculator function and write its source file.', mode: 'auto', preset: 'swarm', providers: { writer: provider, reviewer: provider } } as any);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][1]).toBe('code');
    expect(dispatch.mock.calls[0][4]).toBe('trio');
  } finally { orch.dispose(); }
});
