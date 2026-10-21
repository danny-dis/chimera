import { expect, it, vi } from 'vitest';
import { CliRouter } from '../cli-router.js';
vi.mock('@chimera/core', async original => ({
  ...await original<typeof import('@chimera/core')>(),
  createRuntimeMemory: vi.fn(async (_root, provider, memoryPersistence) => ({ memoryPersistence, ...(provider ? { autoExtract: {} } : {}) })),
}));
vi.mock('@chimera/session', () => ({ CheckpointStore: class {} }));
vi.mock('@chimera/learning', async original => ({ ...await original<typeof import('@chimera/learning')>(), LearningEngine: class {} }));
import { createRuntimeMemory } from '@chimera/core';
it('does not initialize background extraction for --no-learn while retaining memory access', async () => {
  const router = new CliRouter() as any;
  router.program.parseOptions(['--no-learn']);
  router.initializeRuntime();
  const provider = { getModel: () => ({ id: 'configured', provider: 'configured' }), getPricing: () => ({ inputPerMillion: 0, outputPerMillion: 0 }), supportsToolCalling: () => true, supportsStructuredOutput: () => true, supportsVision: () => false, supportsReasoning: () => false, complete: vi.fn() };
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  const runtime = await router.buildRunContext('code');
  try { expect(vi.mocked(createRuntimeMemory).mock.calls.at(-1)?.[1]).toBeUndefined(); }
  finally { runtime.orchestrator.dispose(); }
});
