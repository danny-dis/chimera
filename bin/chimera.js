#!/usr/bin/env node
import { runCli } from '../src/cli.js';

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`chimera: ${message}\n`);
  process.exitCode = 1;
});
