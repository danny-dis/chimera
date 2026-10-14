import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

it.each(['file', 'shell'])('does not overwrite a %s-written artifact with final synthesized prose', async kind => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-final-artifact-'));
  const content = 'exports.add = (a,b) => a+b;';
  const execute = vi.fn(async (_name, args) => {
    fs.writeFileSync(path.join(root, args.path), args.content);
    return { success: true, duration: 0 };
  });
  const orch = new SessionOrchestrator(new EventStream(), {
    registry: { has: () => true, getAll: () => [] }, executor: { execute },
  } as any, root);
  try {
    vi.spyOn(orch as any, 'completeResult').mockImplementation(async result => result);
    fs.writeFileSync(path.join(root, 'sum.js'), content);
    (orch as any)._completion = { signal: new AbortController().signal,
      writtenPaths: new Set(kind === 'file' ? [path.join(root, 'sum.js')] : []), performedShell: kind === 'shell' };
    const before = { mtime: 0, size: content.length, contentHash: (await import('node:crypto')).createHash('sha256').update(content).digest('hex') };
    await (orch as any).deliberationToOrchestratorResult({
      mode: 'hive', output: '```javascript\nmodule.exports = (a,b) => a+b;\n```',
      analysis: { confidence: 0.9 }, totalCostUsd: 0, degraded: false,
    }, 'Create sum.js exporting add(a,b)', 'code', before);
    expect(fs.readFileSync(path.join(root, 'sum.js'), 'utf8')).toBe(content);
    expect(execute).not.toHaveBeenCalled();
  } finally { orch.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
