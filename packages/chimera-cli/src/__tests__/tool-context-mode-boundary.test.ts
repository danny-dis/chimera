import { expect, it } from 'vitest';
import { CostTracker, EventStream } from '@chimera/core';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolContext } from '../tool-context.js';
it('keeps ask mode read-only even with yolo explicitly enabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-policy-mode-'));
  const eventStream = new EventStream();
  try {
    const tools = createToolContext('ask', { interactive: false, yolo: true });
    const result = await tools.toolExecutor.execute('write_file', { path: 'blocked.txt', content: 'must not land' }, {
      workspaceRoot: root, sessionId: 'mode-boundary', eventStream, costTracker: new CostTracker(eventStream), permissionCheck: () => 'deny',
    });
    expect(result.success).toBe(false);
    await expect(access(join(root, 'blocked.txt'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
