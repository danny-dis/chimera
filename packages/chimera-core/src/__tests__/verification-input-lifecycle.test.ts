import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const usage = { inputTokens: 1, outputTokens: 1 };
const verifier = "require('node:assert/strict').equal(require('./sum.js').add(2,3),5);";
const reviewer: LLMProvider = { complete: async () => ({ content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }), usage }) };
function fixture(change: (root: string, round: number) => void) {
  const root = mkdtempSync(join(tmpdir(), 'chimera-verifier-inputs-')); roots.push(root);
  writeFileSync(join(root, 'verify.cjs'), verifier);
  writeFileSync(join(root, 'sum.js'), 'exports.add=(a,b)=>a-b;');
  let round = 0;
  const writer: LLMProvider = { complete: async () => {
    change(root, ++round);
    return { content: JSON.stringify({ response: 'Implemented', confidence: 0.9 }), usage };
  } };
  const execute = vi.fn(async () => {
    try { execFileSync(process.execPath, ['verify.cjs'], { cwd: root, stdio: 'pipe' }); return { success: true, data: { exitCode: 0 }, duration: 0 }; }
    catch { return { success: false, data: { exitCode: 1 }, duration: 0 }; }
  });
  const orchestrator = new SessionOrchestrator(new EventStream(), { registry: { has: name => name === 'run_shell_command', getAll: () => [] }, executor: { execute } }, root);
  const params = { task: 'Implement addition in sum.js', mode: 'code' as const, providers: { writer, reviewer }, verificationCommands: ['node verify.cjs'], verificationInputs: ['verify.cjs'] };
  return { root, orchestrator, params, execute, writer };
}

it.each(['generation', 'repair'])('rejects a caller-owned verifier weakened during %s', async phase => {
  const setup = fixture((root, round) => { if (phase === 'generation' || round === 2) writeFileSync(join(root, 'verify.cjs'), 'process.exit(0);'); });
  try {
    const result = await setup.orchestrator.execute(setup.params);
    expect(result.status).not.toBe('done');
    expect(result.verification?.verified).toBe(false);
    expect(result.verification?.reason).toMatch(/verifier|input/i);
    expect(setup.execute).toHaveBeenCalledTimes(phase === 'generation' ? 0 : 1);
  } finally { setup.orchestrator.dispose(); }
});

it('allows implementation-only repair against the original verifier', async () => {
  const setup = fixture((root, round) => { if (round === 2) writeFileSync(join(root, 'sum.js'), 'exports.add=(a,b)=>a+b;'); });
  try {
    const result = await setup.orchestrator.execute(setup.params);
    expect(result.status).toBe('done');
    expect(result.verification?.verified).toBe(true);
    expect(setup.execute).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(setup.root, 'verify.cjs'), 'utf8')).toBe(verifier);
  } finally { setup.orchestrator.dispose(); }
});

it('does not rebaseline a resumed task from a changed verifier', async () => {
  const setup = fixture(root => writeFileSync(join(root, 'sum.js'), 'exports.add=(a,b)=>a+b;'));
  const restored = new SessionOrchestrator(new EventStream(), undefined, setup.root);
  try {
    await setup.orchestrator.execute(setup.params);
    const checkpoint = setup.orchestrator.exportState('original', setup.params.task, 'code');
    checkpoint.metadata.status = 'active';
    writeFileSync(join(setup.root, 'verify.cjs'), 'process.exit(0);');
    await restored.restoreState(checkpoint);
    await expect(restored.execute(setup.params)).rejects.toThrow(/verifier|input/i);
  } finally { setup.orchestrator.dispose(); restored.dispose(); }
});

it.each([false, true])('preserves verifier identity through restore/export/restore (reused=%s)', async reused => {
  const setup = fixture(root => writeFileSync(join(root, 'sum.js'), 'exports.add=(a,b)=>a+b;'));
  const first = new SessionOrchestrator(new EventStream(), undefined, setup.root);
  const second = new SessionOrchestrator(new EventStream(), undefined, setup.root);
  try {
    await setup.orchestrator.execute(setup.params);
    const checkpoint = setup.orchestrator.exportState('original', setup.params.task, 'code');
    checkpoint.metadata.status = 'active';
    if (reused) await first.execute({ task: 'unrelated', mode: 'ask', providers: setup.params.providers });
    await first.restoreState(checkpoint);
    const exported = first.exportState('roundtrip', setup.params.task, 'code');
    expect(exported.task).toBe(checkpoint.task);
    expect(exported.verificationContract).toEqual(checkpoint.verificationContract);
    await second.restoreState(exported);
    writeFileSync(join(setup.root, 'verify.cjs'), 'process.exit(0);');
    await expect(second.execute(setup.params)).rejects.toThrow(/verifier|input/i);
  } finally { setup.orchestrator.dispose(); first.dispose(); second.dispose(); }
});

it.each(['missing.cjs', '../outside.cjs', '.'])('refuses invalid declared input %s before generation', async file => {
  const setup = fixture(() => {});
  const complete = vi.spyOn(setup.writer, 'complete');
  try {
    await expect(setup.orchestrator.execute({ ...setup.params, verificationInputs: [file] })).rejects.toThrow();
    expect(complete).not.toHaveBeenCalled();
  } finally { setup.orchestrator.dispose(); }
});
