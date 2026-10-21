import { expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
it('records a successful late write on its original completion without accepting the cancelled task', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-late-write-'));
  const controller = new AbortController();
  let finish!: () => void;
  let started!: () => void;
  const admitted = new Promise<void>(resolve => { started = resolve; });
  const execute = vi.fn(async () => {
    started();
    await new Promise<void>(resolve => { finish = resolve; });
    writeFileSync(join(root, 'late.js'), 'exports.answer = 42;');
    return { success: true, duration: 0 };
  });
  const orch = new SessionOrchestrator(new EventStream(), {
    registry: { has: () => true, getAll: () => [] }, executor: { execute },
  }, root);
  const writer = { complete: vi.fn(async () => ({ content: '', usage: { inputTokens: 1, outputTokens: 1 },
    toolCalls: [{ id: 'write', name: 'write_file', arguments: { path: 'late.js', content: 'exports.answer = 42;' } }] })) };
  const reviewer = { complete: vi.fn(async () => ({ content: 'PASS', usage: { inputTokens: 1, outputTokens: 1 } })) };
  const run = orch.execute({ task: 'Create late.js', mode: 'code', preset: 'solo', signal: controller.signal, providers: { writer, reviewer } });
  try {
    await admitted;
    const original = (orch as any)._completion;
    controller.abort(); finish();
    const result = await run;
    expect(result.status).not.toBe('done');
    expect(existsSync(join(root, 'late.js'))).toBe(true);
    expect(original.writtenPaths.has(join(root, 'late.js'))).toBe(true);
  } finally { finish?.(); await run.catch(() => {}); orch.dispose(); rmSync(root, { recursive: true, force: true }); }
}, 20_000);
