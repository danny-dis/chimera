import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventStream } from '../event-stream.js';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { parseReviewVerdict } from '../coordinator/review-verdict.js';
import { DeliberationEngine } from '../coordinator/deliberation/engine.js';
import { snapshotTarget } from '../coordinator/path-from-task.js';

const valid = { verdict: 'PASS', confidence: 0.9, findings: [] };

describe('controller remaining core SPEC gaps', () => {
  it.each([
    ['non-numeric confidence', { ...valid, confidence: 'certain' }],
    ['out-of-range confidence', { ...valid, confidence: 2 }],
    ['non-array findings', { ...valid, findings: {} }],
    ['malformed finding', { ...valid, findings: [{}] }],
  ])('invalid review record cannot PASS: %s', (_name, record) => {
    expect(parseReviewVerdict(JSON.stringify(record)).verdict).not.toBe('PASS');
  });

  it('valid complete review still PASSes', () => {
    expect(parseReviewVerdict(JSON.stringify(valid))).toMatchObject(valid);
  });

  it('actual inline coding run without artifact or executed check cannot be done', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-core-spec-'));
    try {
      const writer = { complete: async () => ({ content: JSON.stringify({ response: 'proposal', confidence: 0.9 }), usage: { inputTokens: 1, outputTokens: 1 } }) };
      const reviewer = { complete: async () => ({ content: JSON.stringify(valid), usage: { inputTokens: 1, outputTokens: 1 } }) };
      const result = await new SessionOrchestrator(new EventStream(), undefined, root).execute({ task: 'implement feature', mode: 'code', costCap: 10, providers: { writer, reviewer } });
      expect(result.status).not.toBe('done');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('actual completion mapper requires executed check, not just changed file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-core-artifact-'));
    try {
      const task = 'create app.py';
      const before = snapshotTarget(task, root);
      fs.writeFileSync(path.join(root, 'app.py'), 'raise RuntimeError("broken")\n');
      const orch = new SessionOrchestrator(new EventStream(), undefined, root);
      const result = await (orch as any).deliberationToOrchestratorResult({
        mode: 'solo', output: 'created app.py', analysis: { confidence: 0.9 },
        totalTokens: 0, totalCostUsd: 0, durationMs: 0, degraded: false,
      }, task, 'code', before);
      expect(result.status).not.toBe('done');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('actual Trio normalization preserves explicit user escalation', () => {
    const engine = new DeliberationEngine({} as never);
    const result = (engine as any).normalizeTrio({
      output: 'review failed', analysis: { confidence: 0.9 },
      totalTokens: 0, totalCostUsd: 0, durationMs: 0, degraded: false,
      needsUserEscalation: true,
    }, Date.now());
    expect(result.needsUserEscalation).toBe(true);
  });
});
