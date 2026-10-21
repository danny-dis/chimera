import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrchestrator } from '@chimera/core';
import type { Mode } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import { createToolContext } from '../tool-context.js';
import { runEval, formatEvalMarkdown } from '../eval-runner.js';
import { buildHelpProgram } from '../help-program.js';

const task = { id: 'controller-no-evidence', description: 'Say hello' };

describe('controller CLI production boundaries', () => {
  it('never writes with an unknown mode even with yolo', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-mode-probe-'));
    try {
      let tools: ReturnType<typeof createToolContext>;
      try { tools = createToolContext('bogus' as Mode, { yolo: true }); }
      catch { return; }
      const result = await tools.toolExecutor.execute(
        { tool: 'write_file', args: { path: 'unauthorized.txt', content: 'not permitted' } },
        { workspaceRoot: root },
      );
      expect({ denied: result.exitCode !== 0, fileExists: fs.existsSync(path.join(root, 'unauthorized.txt')) })
        .toEqual({ denied: true, fileExists: false });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('synthetic reports contain no successful task rows or Markdown YES', async () => {
    const report = await runEval(JSON.stringify(task), { fixturesDir: '.', mode: 'code' });
    expect({ passedRows: report.tasks.filter(t => t.success).length, markdownYES: /\| YES \|/.test(formatEvalMarkdown(report)) })
      .toEqual({ passedRows: 0, markdownYES: false });
  });

  it('real evaluation rejects offline mock providers before inference', async () => {
    const execute = vi.spyOn(SessionOrchestrator.prototype, 'execute').mockResolvedValue({
      status: 'error', output: 'offline mock result', cost: 0,
    } as Awaited<ReturnType<SessionOrchestrator['execute']>>);
    const offline = {
      getModel: () => ({ provider: 'mock', id: 'mock', name: 'mock' }),
      complete: async () => ({ content: 'ok', usage: { inputTokens: 0, outputTokens: 0 } }),
    } as unknown as ModelProvider;
    try {
      await expect(runEval(JSON.stringify(task), {
        fixturesDir: '.', mode: 'code', real: true, providers: { writer: offline, reviewer: offline },
      })).rejects.toThrow(/mock|offline|real provider/i);
      expect(execute).not.toHaveBeenCalled();
    } finally { execute.mockRestore(); }
  });

  it('lightweight help retains existing global mode option and command inventory', () => {
    const help = buildHelpProgram();
    expect(help.options.some(o => o.long === '--mode')).toBe(true);
    for (const command of ['skill', 'workflow', 'learn', 'projects']) {
      expect(help.commands.some(c => c.name() === command), command).toBe(true);
    }
  });
});
