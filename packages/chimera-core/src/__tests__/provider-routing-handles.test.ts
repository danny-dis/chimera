import { expect, it } from 'vitest';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../event-stream.js';
import { SessionOrchestrator } from '../session-orchestrator.js';

it.each([
  ['shared', 'writer:shared', 'shared'],
  ['reviewer', 'other', 'third'],
])('keeps routing handles unique for model IDs %s / %s / %s', async (writerId, reviewerId, challengerId) => {
  const make = (id: string) => ({ getModelId: () => id, complete: async () => ({ content: 'unused' }) });
  const providers = { writer: make(writerId), reviewer: make(reviewerId), challenger: make(challengerId) };
  const orch = new SessionOrchestrator(new EventStream(), undefined, undefined, undefined, { registry: new SimpleModelRegistry() });
  try {
    const factory = (orch as any).buildProviderFactory(providers);
    const config = (orch as any).buildDeliberationConfig('Refactor the calculator.', 'code', providers, 1, 'trio');
    expect(factory(config.writer)).toBe(providers.writer);
    expect(factory(config.reviewer)).toBe(providers.reviewer);
    expect(factory(config.challenger)).toBe(providers.challenger);
  } finally { await orch.dispose(); }
});
