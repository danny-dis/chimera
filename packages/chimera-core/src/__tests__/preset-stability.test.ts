import { expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleModelRegistry } from '@chimera/providers';
import { EventStream } from '../event-stream.js';
import { SessionOrchestrator } from '../session-orchestrator.js';

it('keeps project instructions alongside recalled memory through the actual solo path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-context-stability-'));
  writeFileSync(join(root, 'AGENTS.md'), 'PROJECT_RULE_918: preserve the public API.');
  const seen: string[] = [];
  const writer = { complete: vi.fn(async messages => {
    seen.push(messages.map(message => message.content).join('\n'));
    return { content: 'The public API remains unchanged.', usage: { inputTokens: 1, outputTokens: 1 } };
  }) };
  const orchestrator = new SessionOrchestrator(new EventStream(), undefined, root, undefined, {
    registry: new SimpleModelRegistry(), recallService: { recall: async () => 'RECALLED_FACT_782' } as any,
  });
  try {
    const result = await orchestrator.execute({ task: 'Explain the addition function in sum.js', mode: 'plan',
      preset: 'solo', providers: { writer, reviewer: writer }, costCap: 1 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'deliberation_executed', preset: 'solo', degraded: false }));
    expect(seen.some(text => text.includes('RECALLED_FACT_782'))).toBe(true);
    expect(seen.filter(text => text.includes('RECALLED_FACT_782')).every(text => text.includes('PROJECT_RULE_918'))).toBe(true);
  } finally { await orchestrator.dispose(); rmSync(root, { recursive: true, force: true }); }
});
