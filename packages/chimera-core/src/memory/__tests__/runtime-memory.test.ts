import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRuntimeMemory } from '../runtime-memory.js';

it('persists extracted facts and isolates workspace providers and stores', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-runtime-memory-'));
  const firstRoot = join(root, 'first');
  const secondRoot = join(root, 'second');
  let firstCalls = 0;
  let secondCalls = 0;
  const facts = JSON.stringify({ facts: [{ content: 'Fixture prefers strict TypeScript', type: 'project', importance: 0.9, tags: ['fixture'] }] });
  try {
    const first = await createRuntimeMemory(firstRoot, { complete: async () => { firstCalls++; return { content: facts }; } });
    const second = await createRuntimeMemory(secondRoot, { complete: async () => { secondCalls++; return { content: '{"facts":[]}' }; } });
    await first.autoExtract.extract({ messages: [{ role: 'user', content: 'Use strict TypeScript' }], sessionId: 'first', cursor: 0 });
    await second.autoExtract.extract({ messages: [{ role: 'user', content: 'No durable facts' }], sessionId: 'second', cursor: 0 });
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
    const reopened = await createRuntimeMemory(firstRoot, { complete: async () => { throw new Error('must not be needed to reload'); } });
    expect(reopened.memoryPersistence.getMemory().getAll().map(item => item.content)).toEqual(['Fixture prefers strict TypeScript']);
    expect(second.memoryPersistence.getMemory().size()).toBe(0);
    expect(JSON.parse(await fs.readFile(first.memoryPersistence.getStoragePath(), 'utf8'))).toBeTruthy();
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
