import { Command } from 'commander';

export class CliRouter {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('chimera')
      .description('Terminal-native parallel multi-agent coding platform')
      .version('0.0.1');

    this.program
      .command('ask <query>')
      .description('Ask a question about the codebase')
      .action((query: string) => {
        console.log(`Ask mode: ${query}`);
      });

    this.program
      .command('plan <task>')
      .description('Plan an implementation approach')
      .action((task: string) => {
        console.log(`Plan mode: ${task}`);
      });

    this.program
      .command('code <task>')
      .description('Implement a task with parallel subagents')
      .action((task: string) => {
        console.log(`Code mode: ${task}`);
      });

    this.program
      .command('debug <issue>')
      .description('Debug an issue with parallel hypothesis testing')
      .action((issue: string) => {
        console.log(`Debug mode: ${issue}`);
      });

    this.program
      .command('review <diff>')
      .description('Review a diff with multi-agent verification')
      .action((diff: string) => {
        console.log(`Review mode: ${diff}`);
      });

    this.program
      .command('setup')
      .description('Launch the Config TUI setup wizard')
      .action(() => {
        console.log('Launching Config TUI...');
      });
  }

  parse(argv: string[]): void {
    this.program.parse(argv);
  }
}
