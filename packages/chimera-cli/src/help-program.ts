import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { registerSkillCommand } from './commands/skill.js';
import { registerWorkflowCommand } from './commands/workflow.js';
import { registerLearnCommand } from './commands/learn.js';
import { registerProjectsCommand } from './commands/projects.js';

function readPackageVersion(): string {
  try {
    const manifest = readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8');
    return (JSON.parse(manifest) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build a Commander program with global options and command inventory.
 * Used by index.ts for help/version (lightweight path) and by CliRouter
 * as the canonical registration owner for global options.
 */
export function buildHelpProgram(executeWorkflow?: Parameters<typeof registerWorkflowCommand>[1]): Command {
  const program = new Command();
  program
    .name('chimera')
    .description('Chimera — sovereign AI coding agent')
    .version(readPackageVersion(), '-V, --version', 'output the installed chimera version')
    .option('--mode <mode>', 'set the mode (ask|plan|code|debug|review|oal|auto)')
    .option('-v, --verbose', 'enable verbose event logging')
    .option('--no-learn', 'disable automatic learning after each session')
    .option('--yolo', 'explicitly auto-approve tools in write-capable modes (off by default)')
    .option('--repl', 'launch line-based REPL instead of the TUI dashboard');

  registerSkillCommand(program);
  registerWorkflowCommand(program, executeWorkflow);
  registerLearnCommand(program);
  registerProjectsCommand(program);

  return program;
}
