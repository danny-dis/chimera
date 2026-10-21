import type { ReactElement } from 'react';
import { PassThrough } from 'node:stream';
import { render } from 'ink';

export function interactiveScreen(element: ReactElement, columns = 100, rows = 40) {
  const rawModeCalls: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true, isRaw: false,
    setRawMode: (value: boolean) => { stdin.isRaw = value; rawModeCalls.push(value); return stdin; },
    ref: () => stdin, unref: () => stdin,
  });
  const stdout = Object.assign(new PassThrough(), { isTTY: false, columns, rows });
  const stderr = new PassThrough();
  let frame = '', errors = '';
  let fatal: unknown;
  stdout.on('data', chunk => { frame = chunk.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''); });
  stderr.on('data', chunk => { errors += chunk.toString(); });
  const app = render(element, {
    stdin: stdin as unknown as typeof process.stdin,
    stdout: stdout as unknown as typeof process.stdout,
    stderr: stderr as unknown as typeof process.stderr,
    debug: true, exitOnCtrlC: false, patchConsole: false,
  });
  void app.waitUntilExit().catch(error => { fatal = error; });
  const assertHealthy = () => {
    if (fatal) throw fatal;
    if (errors || /^\s*ERROR\b/m.test(frame)) throw new Error(errors || frame);
  };
  return {
    stdin, rawModeCalls, assertHealthy,
    lastFrame: () => { assertHealthy(); return frame; },
    errors: () => errors, rerender: app.rerender,
    resize: (columns: number, rows: number) => { stdout.columns = columns; stdout.rows = rows; stdout.emit('resize'); },
    unmount: async () => {
      app.unmount(); app.cleanup();
      await new Promise(resolve => setImmediate(resolve));
      stdin.destroy(); stdout.destroy(); stderr.destroy(); assertHealthy();
      if (stdin.isRaw) throw new Error('Raw mode was not released');
    },
  };
}
