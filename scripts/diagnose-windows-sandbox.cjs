const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

if (process.platform !== 'win32') throw new Error('Windows probe only');
const cwd = process.cwd();
console.log(JSON.stringify({ node: process.version, cwd }));
const started = performance.now();
const { execa } = require('../packages/chimera-tools/node_modules/execa');
console.log(JSON.stringify({ execaLoadMs: Math.round(performance.now() - started) }));

(async () => {
  for (const command of ['[Console]::WriteLine("hello")', 'echo hello', 'Write-Error error', '$env:OS']) {
    for (const flags of [[], ['-NoProfile', '-NonInteractive']]) {
      const args = [...flags, '-Command', command];
      const start = performance.now();
      const result = spawnSync('powershell', args, {
        cwd, encoding: 'utf8', timeout: 35000, stdio: ['ignore', 'pipe', 'pipe'],
      });
      console.log(JSON.stringify({ command, flags, nativeMs: Math.round(performance.now() - start),
        exitCode: result.status, error: result.error?.code, stdout: result.stdout, stderr: result.stderr }));
    }
  }
  for (const command of ['echo hello', 'Write-Error error']) {
    const start = performance.now();
    const result = await execa('powershell', ['-Command', command], {
      cwd, timeout: 35000, reject: false,
    });
    console.log(JSON.stringify({ command, execaMs: Math.round(performance.now() - start),
      exitCode: result.exitCode, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
