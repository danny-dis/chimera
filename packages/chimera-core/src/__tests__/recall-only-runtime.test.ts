import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntimeMemory } from '../memory/runtime-memory.js';
it('loads durable memory without constructing extraction or dreaming when learning is disabled', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-recall-only-'));
  try {
    const runtime = await createRuntimeMemory(root, undefined);
    expect(runtime.memoryPersistence.getMemory()).toBeTruthy();
    expect(runtime.recallService).toBeTruthy();
    expect(runtime).not.toHaveProperty('autoExtract');
    expect(runtime).not.toHaveProperty('autoDream');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
