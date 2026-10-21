import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { SessionOrchestrator, type LLMProvider, type ToolExecutorInterface } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import type { Mode } from '../types/agent.js';

const usage = { inputTokens: 1, outputTokens: 1 };
const pass = { complete: async () => ({ content: JSON.stringify({ verdict: 'PASS', confidence: 0.9, findings: [] }), usage }) };
const draft = { complete: async () => ({ content: JSON.stringify({ response: 'COMPLETE', confidence: 0.9 }), usage }) };

async function fixture(test: (orch: SessionOrchestrator, root: string, controller: AbortController, execute: ReturnType<typeof vi.fn>) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-completion-seam-'));
  const controller = new AbortController();
  const execute = vi.fn().mockResolvedValue({ success: true, data: { exitCode: 0 }, duration: 0 });
  const orch = new SessionOrchestrator(new EventStream(), {
    registry: { has: name => name === 'shell', getAll: () => [] }, executor: { execute } as ToolExecutorInterface,
  }, root);
  try { await test(orch, root, controller, execute); }
  finally { orch.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
}

const params = (mode: Mode, signal?: AbortSignal) => ({ task: 'implement feature', mode, signal,
  verificationCommands: ['caller check'], providers: { writer: draft, reviewer: pass } });

describe('completion choke point', () => {
  it.each(['code', 'debug', 'oal'] as const)('%s no-op artifact can pass a real registered check', async mode => {
    await fixture(async (orch, root, controller, execute) => {
      fs.writeFileSync(path.join(root, 'artifact.txt'), 'already correct');
      const command = `"${process.execPath}" --version`;
      execute.mockImplementation(async (name, args, context) => {
        expect(name).toBe('shell'); expect(args.command).toBe(command);
        expect(context).toMatchObject({ workspaceRoot: root, mode, signal: expect.any(AbortSignal) });
        expect(context.signal.aborted).toBe(false);
        const stdout = execSync(args.command, { cwd: context.workspaceRoot, encoding: 'utf8' });
        expect(stdout).toMatch(/^v\d+/);
        return { success: true, data: { exitCode: 0, stdout }, duration: 0 };
      });
      const result = await orch.execute({ ...params(mode, controller.signal), verificationCommands: [command] });
      expect(result.status).toBe('done'); expect(result.verification?.verified).toBe(true);
      expect(fs.readFileSync(path.join(root, 'artifact.txt'), 'utf8')).toBe('already correct');
    });
  });

  it('verification mutation stales evidence and raw shell output is not retained', async () => {
    await fixture(async (orch, root, controller, execute) => {
      execute.mockImplementation(async () => {
        fs.writeFileSync(path.join(root, 'artifact.txt'), 'changed during check');
        return { success: true, data: { exitCode: 0, stdout: 'PRIVATE_OUTPUT' }, duration: 0 };
      });
      const result = await orch.execute(params('code', controller.signal));
      expect(result.status).toBe('needs_user'); expect(result.verification?.reason).toMatch(/stale/i);
      expect(JSON.stringify(result.verification)).not.toContain('PRIVATE_OUTPUT');
    });
  });

  it.each(['.env', 'credentials.json'])('changed %s stales verification without exposing secret contents', async file => {
    await fixture(async (orch, root, controller, execute) => {
      fs.writeFileSync(path.join(root, file), 'SECRET_FIXTURE');
      execute.mockImplementation(async () => {
        fs.writeFileSync(path.join(root, file), 'REPLACED_SECRET_FIXTURE');
        return { success: true, data: { exitCode: 0 }, duration: 0 };
      });
      const result = await orch.execute(params('code', controller.signal));
      expect(result.status).toBe('needs_user');
      expect(result.verification?.verified).toBe(false);
      expect(result.verification?.reason).toMatch(/stale/i);
      expect(JSON.stringify(result)).not.toContain('SECRET_FIXTURE');
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  it('stable secret files allow verification without exposing their contents', async () => {
    await fixture(async (orch, root, controller) => {
      fs.writeFileSync(path.join(root, '.env'), 'SECRET_FIXTURE');
      fs.writeFileSync(path.join(root, 'credentials.json'), 'SECRET_FIXTURE');
      const result = await orch.execute(params('code', controller.signal));
      expect(result.status).toBe('done');
      expect(result.verification?.verified).toBe(true);
      expect(JSON.stringify(result)).not.toContain('SECRET_FIXTURE');
    });
  });

  it('cancellation during a check stops the next command', async () => {
    await fixture(async (orch, _root, controller, execute) => {
      execute.mockImplementation(async () => { controller.abort(); return { success: true, data: { exitCode: 0 }, duration: 0 }; });
      const result = await orch.execute({ ...params('code', controller.signal), verificationCommands: ['one', 'two'] });
      expect(result.status).not.toBe('done'); expect(result.verification?.verified).toBe(false);
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  it('forwards composed cancellation to providers and refuses reviewer after writer spend', async () => {
    await fixture(async (orch, _root, controller, execute) => {
      const writer: LLMProvider = { getPricing: () => ({ inputPerMillion: 20_000_000, outputPerMillion: 0 }),
        complete: vi.fn(async (_messages, options) => {
          expect(options?.signal).toBeInstanceOf(AbortSignal);
          expect(options?.signal?.aborted).toBe(false);
          return { content: JSON.stringify({ response: 'COMPLETE', confidence: 0.9 }), usage };
        }) };
      const reviewer = { complete: vi.fn(pass.complete) };
      const result = await orch.execute({ ...params('code', controller.signal), costCap: 10, providers: { writer, reviewer } });
      expect(reviewer.complete).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
      expect(result.status).not.toBe('done'); expect(result.verification?.reason).toMatch(/budget/i);
    });
  });

  it('pre-aborted code admission yields unverified result and zero calls', async () => {
    await fixture(async (orch, _root, controller, execute) => {
      controller.abort(); const writer = { complete: vi.fn(draft.complete) };
      const result = await orch.execute({ ...params('code', controller.signal), providers: { writer, reviewer: pass } });
      expect(writer.complete).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
      expect(result.verification?.verified).toBe(false);
    });
  });

  it('simple ASK still needs no shell check', async () => {
    await fixture(async (orch, _root, controller, execute) => {
      const result = await orch.execute({ task: 'Hello', mode: 'ask', signal: controller.signal, providers: { writer: draft, reviewer: pass } });
      expect(result.status).toBe('done'); expect(execute).not.toHaveBeenCalled();
    });
  });

  it('changed artifact cannot suppress deliberation escalation or trigger a fallback write', async () => {
    await fixture(async (orch, root, _controller, execute) => {
      fs.writeFileSync(path.join(root, 'app.py'), 'broken');
      const result = await (orch as any).deliberationToOrchestratorResult({ mode: 'solo', output: '```python\nprint(1)\n```',
        analysis: { confidence: 0.9 }, totalCostUsd: 0, degraded: false, needsUserEscalation: true }, 'create app.py', 'code', null);
      expect(result.status).not.toBe('done'); expect(result.verification.verified).toBe(false);
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
