import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runShellCommandTool } from '../tools/shell.js';
import type { ToolContext } from '../tool-schema.js';

describe('shell command quoting', () => {
  it('executes quoted inline JavaScript instead of returning an empty success', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-shell-quote-'));
    try {
      const result = await runShellCommandTool.execute({
        command: `"${process.execPath}" -e "console.log('INLINE_QUOTE_OK')"`, timeout: 10_000,
      }, { workspaceRoot: root } as ToolContext);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('INLINE_QUOTE_OK');
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
  });

  it('preserves quoted arguments containing spaces and shell operators', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-shell-args-'));
    try {
      fs.writeFileSync(path.join(root, 'args.cjs'), 'console.log(JSON.stringify(process.argv.slice(2)));');
      const result = await runShellCommandTool.execute({
        command: `"${process.execPath}" args.cjs "a b" "x&y" "x|y"`, timeout: 10_000,
      }, { workspaceRoot: root } as ToolContext);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(['a b', 'x&y', 'x|y']);
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
  });
});
