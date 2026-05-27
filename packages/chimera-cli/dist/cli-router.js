"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliRouter = void 0;
const commander_1 = require("commander");
class CliRouter {
    program;
    constructor() {
        this.program = new commander_1.Command();
        this.setupCommands();
    }
    setupCommands() {
        this.program
            .name('chimera')
            .description('Terminal-native parallel multi-agent coding platform')
            .version('0.0.1');
        this.program
            .command('ask <query>')
            .description('Ask a question about the codebase')
            .action((query) => {
            console.log(`Ask mode: ${query}`);
        });
        this.program
            .command('plan <task>')
            .description('Plan an implementation approach')
            .action((task) => {
            console.log(`Plan mode: ${task}`);
        });
        this.program
            .command('code <task>')
            .description('Implement a task with parallel subagents')
            .action((task) => {
            console.log(`Code mode: ${task}`);
        });
        this.program
            .command('debug <issue>')
            .description('Debug an issue with parallel hypothesis testing')
            .action((issue) => {
            console.log(`Debug mode: ${issue}`);
        });
        this.program
            .command('review <diff>')
            .description('Review a diff with multi-agent verification')
            .action((diff) => {
            console.log(`Review mode: ${diff}`);
        });
        this.program
            .command('setup')
            .description('Launch the Config TUI setup wizard')
            .action(() => {
            console.log('Launching Config TUI...');
        });
    }
    parse(argv) {
        this.program.parse(argv);
    }
}
exports.CliRouter = CliRouter;
//# sourceMappingURL=cli-router.js.map