import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLspConnection, terminateLspProcess, type LspConnection } from '../connection.js';
it('drains server stderr before waiting for startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chimera-stderr-'));
  let child: Awaited<ReturnType<typeof startLspConnection>>['child'] | undefined;
  try {
    const file = join(root, 'server.cjs');
    await writeFile(file, 'process.stderr.write("x".repeat(1024*1024),()=>{process.stdout.write("READY\\n");setInterval(()=>{},1000);});');
    const result = await startLspConnection({ workspaceRoot: root, config: { command: process.execPath, args: [file] }, connectionFactory: async owned => {
      child = owned;
      const ready = await new Promise<string>((resolve, reject) => { owned.stdout.once('data', data => resolve(String(data))); owned.once('error', reject); });
      expect(ready).toContain('READY');
      return { listen() {}, dispose() {}, onNotification: () => ({ dispose() {} }), sendNotification() {}, sendRequest: async () => null } as unknown as LspConnection;
    } });
    expect(result.child.exitCode).toBeNull();
  } finally { if (child) await terminateLspProcess(child); await rm(root, { recursive: true, force: true }); }
}, 15000);
