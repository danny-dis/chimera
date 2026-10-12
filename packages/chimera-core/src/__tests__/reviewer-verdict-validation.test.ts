/**
 * Regression tests for reviewer verdict validation.
 *
 * BUG: session-orchestrator.ts:1239 defaults missing/malformed verdicts to PASS.
 *     `const verdict = reviewParsed.verdict ?? 'PASS';`
 *     A reviewer that returns no verdict, an invalid verdict string, or
 *     malformed JSON is treated as PASS — a false-green quality gate.
 *
 * EXPECTED (after fix):
 *   - Missing verdict → NEEDS_REVISION (or 'unknown'), NOT PASS
 *   - Invalid verdict string → NEEDS_REVISION, NOT PASS
 *   - Malformed JSON → NEEDS_REVISION, NOT PASS
 *   - Valid PASS → PASS
 *   - Valid FAIL → FAIL
 *   - Valid NEEDS_REVISION → NEEDS_REVISION
 *
 * These tests are RED against the current source and GREEN once the
 * verdict validation is fixed.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrchestrator, type LLMProvider, type ToolExecutorInterface } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

function mockProvider(data: Record<string, unknown>): LLMProvider {
  return {
    async complete() {
      return {
        content: JSON.stringify(data),
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    },
  };
}

function mockProviderWithContent(content: string): LLMProvider {
  return {
    async complete() {
      return {
        content,
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    },
  };
}

describe('reviewer verdict validation', () => {
  it('defaults to NEEDS_REVISION when verdict field is missing', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    // Reviewer returns valid JSON but NO verdict field
    const reviewer = mockProvider({ confidence: 0.5, findings: [] });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    // After fix: should NOT be 'done' (PASS default). Should be needs_user or error.
    // Before fix: result.status === 'done' (false PASS)
    expect(result.status).not.toBe('done');
  });

  it('defaults to NEEDS_REVISION when verdict is an invalid string', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({ verdict: 'MAYBE', confidence: 0.5, findings: [] });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    expect(result.status).not.toBe('done');
  });

  it('defaults to NEEDS_REVISION when reviewer returns malformed JSON', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProviderWithContent('this is not JSON at all');

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    expect(result.status).not.toBe('done');
  });

  it('defaults to NEEDS_REVISION when reviewer returns empty string', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProviderWithContent('');

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    expect(result.status).not.toBe('done');
  });

  it('accepts valid PASS verdict with caller-owned verification evidence', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-reviewer-verdict-'));
    const execute = vi.fn().mockResolvedValue({ success: true, data: { exitCode: 0 }, duration: 0 });
    const orch = new SessionOrchestrator(new EventStream(), {
      registry: { has: name => name === 'run_shell_command', getAll: () => [] },
      executor: { execute } as ToolExecutorInterface,
    }, root);
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({ verdict: 'PASS', confidence: 0.9, findings: [] });

    try {
      const result = await orch.execute({
        task: 'implement feature',
        mode: 'code',
        providers: { writer, reviewer },
        costCap: 10,
        verificationCommands: ['caller check'],
      });

      expect(execute).toHaveBeenCalledWith('run_shell_command', { command: 'caller check' }, expect.objectContaining({ workspaceRoot: root, mode: 'code' }));
      expect(result.verification?.verified).toBe(true);
      expect(result.status).toBe('done');
    } finally {
      orch.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('valid PASS verdict without verification evidence escalates to needs_user', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({ verdict: 'PASS', confidence: 0.9, findings: [] });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    expect(result.status).toBe('needs_user');
    expect(result.verification?.verified).toBe(false);
  });

  it('accepts valid FAIL verdict and escalates to needs_user', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({
      verdict: 'FAIL',
      confidence: 0.9,
      findings: [{ description: 'bug', severity: 'high', evidence: 'test fails' }],
    });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer },
      costCap: 10,
    });

    expect(result.status).toBe('needs_user');
  });

  it('accepts valid NEEDS_REVISION verdict and triggers challenger', async () => {
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({
      verdict: 'NEEDS_REVISION',
      confidence: 0.7,
      findings: [{ description: 'missing tests', severity: 'med', evidence: 'none' }],
    });
    const challenger = mockProvider({ response: 'improved', confidence: 0.8, issues: [] });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer, challenger },
      costCap: 10,
    });

    // NEEDS_REVISION should trigger challenger, then finalize as done
    expect(result.agentCount).toBe(3);
  });

  it('parallel reviewer path also rejects missing verdict', async () => {
    // Tests the parallel quality gate path (line ~2358)
    const orch = new SessionOrchestrator(new EventStream());
    const writer = mockProvider({ response: 'done', confidence: 0.9 });
    const reviewer = mockProvider({ confidence: 0.5, findings: [] });    const challenger = mockProvider({ response: 'ok', confidence: 0.8, issues: [] });

    const result = await orch.execute({
      task: 'implement feature',
      mode: 'code',
      providers: { writer, reviewer, challenger },
      costCap: 10,
    });

    // After fix: parallel path should also reject missing verdict
    expect(result.status).not.toBe('done');
  });
});
