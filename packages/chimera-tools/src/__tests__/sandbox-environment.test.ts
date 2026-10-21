import { expect, it } from 'vitest';
import os from 'node:os';
import { Sandbox } from '../sandbox/sandbox.js';

it('keeps blocked parent variables out of the child while forwarding explicit environment', async () => {
  const previous = process.env.CHIMERA_PROBE_SECRET;
  process.env.CHIMERA_PROBE_SECRET = 'fake-regression-sentinel';
  const sandbox = new Sandbox({ tier: 'process', workspaceRoot: os.tmpdir(), timeoutMs: 30000 });
  try {
    const command = process.platform === 'win32'
      ? '[Console]::WriteLine([bool]$env:CHIMERA_PROBE_SECRET); [Console]::WriteLine($env:CHIMERA_PROBE_ALLOWED)'
      : 'if [ -n "$CHIMERA_PROBE_SECRET" ]; then echo True; else echo False; fi; echo "$CHIMERA_PROBE_ALLOWED"';
    const result = await sandbox.execute(command, { env: { CHIMERA_PROBE_ALLOWED: 'forwarded' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.split(/\r?\n/)).toEqual(['False', 'forwarded']);
  } finally {
    sandbox.destroy();
    if (previous === undefined) delete process.env.CHIMERA_PROBE_SECRET;
    else process.env.CHIMERA_PROBE_SECRET = previous;
  }
});
