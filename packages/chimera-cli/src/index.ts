#!/usr/bin/env node
import 'dotenv/config';
import { buildHelpProgram } from './help-program.js';

async function main() {
  const argv = process.argv.slice(2);

  const isHelpOrVersion = argv.includes('--help') || argv.includes('-h') ||
    argv.includes('--version') || argv.includes('-V') ||
    argv.some((__, i) => argv[i - 1] === 'help' || argv[i - 1] === '--help');

  if (isHelpOrVersion && argv.every(arg => arg.startsWith('-'))) {
    const program = buildHelpProgram();
    await program.parseAsync(process.argv);
  } else {
    const { CliRouter } = await import('./cli-router.js');
    const router = new CliRouter();
    await router.runCli(process.argv);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
