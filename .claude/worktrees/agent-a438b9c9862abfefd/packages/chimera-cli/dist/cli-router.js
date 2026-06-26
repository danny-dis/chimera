"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliRouter = void 0;
const commander_1 = require("commander");
const readline = __importStar(require("readline"));
const core_1 = require("@chimera/core");
const providers_1 = require("@chimera/providers");
const session_1 = require("@chimera/session");
const tools_1 = require("@chimera/tools");
function adaptProvider(provider) {
    return {
        async complete(messages, options) {
            const result = await provider.complete(messages.map((m) => ({
                role: m.role,
                content: m.content,
            })), {
                temperature: options?.temperature,
                maxTokens: options?.maxTokens,
                responseFormat: options?.responseFormat,
            });
            return {
                content: result.content,
                usage: {
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                },
            };
        },
    };
}
class CliRouter {
    program;
    verbose = false;
    sessionStore;
    memory;
    constructor() {
        this.program = new commander_1.Command();
        this.sessionStore = new session_1.CheckpointStore();
        this.memory = new core_1.LongTermMemory();
        this.setupCommands();
    }
    async initOrchestrator() {
        const eventStream = new core_1.EventStream();
        if (this.verbose) {
            eventStream.subscribe('*', (event) => {
                console.log(`  [event] ${event.type}`, JSON.stringify(event, null, 2));
            });
        }
        // Wire up tool system
        const registry = new tools_1.ToolRegistry();
        const executor = new tools_1.ToolExecutor(registry, () => 'allow');
        for (const tool of tools_1.allTools) {
            registry.register(tool);
        }
        return new core_1.SessionOrchestrator(eventStream, { registry: registry, executor: executor }, process.cwd());
    }
    async getProviders() {
        try {
            const providers = providers_1.ProviderFactory.createFromEnv();
            const hasRealKeys = providers.some((p) => p.getModel().provider !== 'mock');
            if (!hasRealKeys) {
                console.log('\n  ⚠ No API keys configured — using offline MockProvider. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to use a real model.\n');
            }
            return providers;
        }
        catch (err) {
            console.error(`\n✗ Provider initialization failed: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
        }
    }
    async run(mode, task) {
        const label = {
            ask: 'Answering',
            plan: 'Planning',
            code: 'Coding',
            debug: 'Debugging',
            review: 'Reviewing',
            oal: 'Optimizing',
        };
        console.log(`\n⚙ Chimera [${mode}] — ${label[mode]}...\n`);
        const providers = await this.getProviders();
        const writer = adaptProvider(providers[0]);
        const reviewer = adaptProvider(providers[1] ?? providers[0]);
        const orchestrator = await this.initOrchestrator();
        try {
            const result = await orchestrator.execute({
                task,
                mode,
                providers: { writer, reviewer },
            });
            this.printResult(result);
        }
        catch (err) {
            console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
            process.exit(1);
        }
    }
    printResult(result) {
        const statusIcon = {
            done: '✓',
            blocked: '⚠',
            needs_user: '?',
            error: '✗',
        };
        console.log(`\n${statusIcon[result.status] ?? '·'} Status: ${result.status}`);
        console.log(`  Cost: $${result.cost.toFixed(4)}`);
        console.log(`  Agents: ${result.agentCount}`);
        console.log(`\n${result.output}\n`);
    }
    setupCommands() {
        this.program
            .name('chimera')
            .description('Chimera — sovereign AI coding agent')
            .option('-v, --verbose', 'enable verbose event logging')
            .option('--repl', 'launch line-based REPL instead of the TUI dashboard')
            .action(async () => {
            const opts = this.program.opts();
            this.verbose = opts.verbose ?? false;
            // Default: fullscreen TUI dashboard (OpenCode / Claude Code style).
            // Pass --repl to use the older line-based readline interface.
            if (opts.repl) {
                await this.startRepl();
            }
            else {
                await this.startTui();
            }
        });
        this.program
            .command('ask <task>')
            .description('Ask a question')
            .option('--tui', 'use TUI for this task')
            .action(async (task, options) => {
            this.verbose = this.program.opts().verbose ?? false;
            if (options.tui) {
                await this.startTui(task, 'ask');
            }
            else {
                await this.run('ask', task);
            }
        });
        this.program
            .command('plan <task>')
            .description('Create a plan')
            .action(async (task) => {
            this.verbose = this.program.opts().verbose ?? false;
            await this.run('plan', task);
        });
        this.program
            .command('code <task>')
            .description('Write code')
            .action(async (task) => {
            this.verbose = this.program.opts().verbose ?? false;
            await this.run('code', task);
        });
        this.program
            .command('debug <task>')
            .description('Debug an issue')
            .action(async (task) => {
            this.verbose = this.program.opts().verbose ?? false;
            await this.run('debug', task);
        });
        this.program
            .command('review <task>')
            .description('Review code')
            .action(async (task) => {
            this.verbose = this.program.opts().verbose ?? false;
            await this.run('review', task);
        });
        this.program
            .command('parallel <task>')
            .description('Execute task with parallel sub-agents')
            .action(async (task) => {
            this.verbose = this.program.opts().verbose ?? false;
            await this.runParallel(task);
        });
        this.program
            .command('sessions')
            .description('List saved sessions')
            .action(async () => {
            const sessions = await this.sessionStore.list();
            if (sessions.length === 0) {
                console.log('\nNo saved sessions.\n');
                return;
            }
            console.log('\nSaved sessions:\n');
            for (const s of sessions) {
                const cost = `$${s.cost.toFixed(4)}`;
                console.log(`  ${s.id}  ${s.mode.padEnd(6)}  ${s.status.padEnd(10)}  ${cost.padEnd(10)}  ${s.task.slice(0, 50)}`);
            }
            console.log();
        });
        this.program
            .command('resume <sessionId>')
            .description('Resume a saved session')
            .action(async (sessionId) => {
            const checkpoint = await this.sessionStore.load(sessionId);
            if (!checkpoint) {
                console.error(`\n✗ Session "${sessionId}" not found.\n`);
                process.exit(1);
            }
            console.log(`\n⚙ Resuming session ${sessionId}...`);
            console.log(`  Task: ${checkpoint.task}`);
            console.log(`  Mode: ${checkpoint.mode}`);
            console.log(`  Status: ${checkpoint.metadata.status}\n`);
            // Resume by re-running the task
            await this.run(checkpoint.mode, checkpoint.task);
        });
    }
    async startTui(initialTask, initialMode = 'code') {
        // Lazy-load Ink/TUI: it's an ESM module with top-level await and cannot be
        // required() synchronously from this CJS CLI. Dynamic import keeps boot clean.
        const { runTUI } = await import('@chimera/tui');
        const providers = await this.getProviders();
        const writer = adaptProvider(providers[0]);
        const reviewer = adaptProvider(providers[1] ?? providers[0]);
        const orchestrator = await this.initOrchestrator();
        let currentMessages = [];
        let currentAgents = [];
        let currentCostData = { currentCost: 0, budget: 10, breakdown: [] };
        let currentEvents = [];
        let currentMode = initialMode;
        const tui = runTUI({
            mode: currentMode,
            messages: currentMessages,
            agents: currentAgents,
            costData: currentCostData,
            events: currentEvents,
            onSendMessage: async (text) => {
                currentMessages = [...currentMessages, {
                        id: Math.random().toString(36).slice(2),
                        role: 'user',
                        content: text,
                        timestamp: Date.now()
                    }];
                tui.update({ messages: currentMessages });
                try {
                    await orchestrator.execute({
                        task: text,
                        mode: currentMode,
                        providers: { writer, reviewer }
                    });
                }
                catch (err) {
                    currentEvents = [...currentEvents, {
                            id: Math.random().toString(36).slice(2),
                            timestamp: Date.now(),
                            type: 'error',
                            message: err instanceof Error ? err.message : String(err)
                        }];
                    tui.update({ events: currentEvents });
                }
            },
            onModeChange: (mode) => {
                currentMode = mode;
                tui.update({ mode: currentMode });
            }
        });
        // Subscribe to events and update TUI state
        orchestrator.getEventStream().subscribe('*', (event) => {
            // Update Events
            currentEvents = [...currentEvents, {
                    id: Math.random().toString(36).slice(2),
                    timestamp: Date.now(),
                    type: event.type,
                    message: 'text' in event ? event.text : event.type,
                    data: event
                }].slice(-50);
            // Update Agents
            if (event.type === 'agent_spawned') {
                currentAgents = [...currentAgents, {
                        id: event.agentId,
                        role: event.role,
                        provider: event.provider,
                        model: event.model,
                        status: 'running',
                        tokenUsage: { input: 0, output: 0 }
                    }];
            }
            else if (event.type === 'verified' || event.type === 'challenged') {
                currentAgents = currentAgents.map(a => a.id === event.agentId ? { ...a, status: 'completed' } : a);
            }
            // Update Messages for final response
            if (event.type === 'final_response') {
                currentMessages = [...currentMessages, {
                        id: Math.random().toString(36).slice(2),
                        role: 'assistant',
                        content: 'Task completed.', // Real content should come from synthesizer event or similar
                        timestamp: Date.now()
                    }];
            }
            tui.update({
                events: currentEvents,
                agents: currentAgents,
                messages: currentMessages,
                costData: currentCostData
            });
        });
        if (initialTask) {
            // Trigger initial task
            currentMessages = [...currentMessages, {
                    id: Math.random().toString(36).slice(2),
                    role: 'user',
                    content: initialTask,
                    timestamp: Date.now()
                }];
            tui.update({ messages: currentMessages });
            await orchestrator.execute({
                task: initialTask,
                mode: initialMode,
                providers: { writer, reviewer }
            });
        }
        await tui.waitUntilExit();
    }
    async startRepl() {
        console.log('\n  Chimera — interactive mode');
        console.log('  Type your task, or /help for commands.\n');
        let currentMode = 'code';
        let sessionId = this.sessionStore.generateSessionId();
        const history = [];
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'chimera> ',
        });
        const printHelp = () => {
            console.log(`
  Commands:
    /mode <ask|plan|code|debug|review>  — switch mode
    /cost                              — show session cost
    /history                           — show command history
    /sessions                          — list saved sessions
    /clear                             — clear screen
    /exit                              — exit interactive mode
    /help                              — show this help
      `);
        };
        rl.prompt();
        rl.on('line', async (line) => {
            const input = line.trim();
            if (!input) {
                rl.prompt();
                return;
            }
            // Handle slash commands
            if (input.startsWith('/')) {
                const [cmd, ...args] = input.slice(1).split(/\s+/);
                switch (cmd) {
                    case 'mode':
                        if (args[0] && ['ask', 'plan', 'code', 'debug', 'review'].includes(args[0])) {
                            currentMode = args[0];
                            console.log(`  Mode: ${currentMode}`);
                        }
                        else {
                            console.log(`  Current mode: ${currentMode}. Use /mode <ask|plan|code|debug|review>`);
                        }
                        break;
                    case 'cost':
                        console.log(`  Session: ${sessionId}`);
                        console.log(`  Mode: ${currentMode}`);
                        break;
                    case 'history':
                        if (history.length === 0) {
                            console.log('  No history yet.');
                        }
                        else {
                            history.forEach((h, i) => console.log(`  ${i + 1}. ${h.slice(0, 80)}`));
                        }
                        break;
                    case 'sessions':
                        const sessions = await this.sessionStore.list();
                        if (sessions.length === 0) {
                            console.log('  No saved sessions.');
                        }
                        else {
                            for (const s of sessions) {
                                console.log(`  ${s.id}  ${s.mode}  ${s.status}  ${s.task.slice(0, 50)}`);
                            }
                        }
                        break;
                    case 'clear':
                        console.clear();
                        break;
                    case 'exit':
                    case 'quit':
                        console.log('\n  Goodbye.\n');
                        rl.close();
                        process.exit(0);
                        break;
                    case 'help':
                        printHelp();
                        break;
                    default:
                        console.log(`  Unknown command: /${cmd}. Type /help for commands.`);
                }
                rl.prompt();
                return;
            }
            // Process task
            history.push(input);
            console.log(`\n⚙ [${currentMode}] processing...\n`);
            // Retrieve relevant memories
            let memoryContext = '';
            try {
                const memories = await this.memory.retrieve({ text: input, topK: 5 });
                if (memories.length > 0) {
                    memoryContext = '\n\nRelevant memories:\n' +
                        memories.map((m) => `- ${m.item.content}`).join('\n');
                }
            }
            catch {
                // Memory retrieval is non-blocking
            }
            const providers = await this.getProviders();
            const writer = adaptProvider(providers[0]);
            const reviewer = adaptProvider(providers[1] ?? providers[0]);
            const orchestrator = await this.initOrchestrator();
            try {
                const taskWithContext = memoryContext ? `${input}${memoryContext}` : input;
                const result = await orchestrator.execute({
                    task: taskWithContext,
                    mode: currentMode,
                    providers: { writer, reviewer },
                });
                this.printResult(result);
                // Store key facts from this turn
                if (result.output && result.status === 'done') {
                    try {
                        await this.memory.write({
                            content: `Task: ${input}\nResult: ${result.output.slice(0, 500)}`,
                            topic: currentMode,
                            importance: 0.6,
                            source: 'user',
                            sessionId,
                        });
                    }
                    catch {
                        // Memory storage is non-blocking
                    }
                }
                // Auto-checkpoint after each turn
                const checkpoint = orchestrator.exportState(sessionId, input, currentMode);
                await this.sessionStore.save(checkpoint);
            }
            catch (err) {
                console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
            }
            rl.prompt();
        });
        rl.on('close', () => {
            console.log('\n  Goodbye.\n');
            process.exit(0);
        });
    }
    async runParallel(task) {
        console.log(`\n⚙ Chimera [parallel] — decomposing task...\n`);
        const providers = await this.getProviders();
        const provider = adaptProvider(providers[0]);
        const eventStream = new core_1.EventStream();
        if (this.verbose) {
            eventStream.subscribe('*', (event) => {
                console.log(`  [event] ${event.type}`, JSON.stringify(event, null, 2));
            });
        }
        const coordinator = new core_1.CoordinatorEngine({ provider, eventStream });
        try {
            const result = await coordinator.execute(task, 'parallel execution');
            console.log(`\n✓ Status: ${result.resolved ? 'resolved' : 'conflict'}`);
            console.log(`  Sub-tasks: ${result.subTaskResults.length}`);
            console.log(`  Conflicts: ${result.conflicts.length}`);
            console.log(`  Tokens: ${result.totalTokens}`);
            console.log(`\n${result.output}\n`);
        }
        catch (err) {
            console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
    }
    async runCli(argv) {
        await this.program.parseAsync(argv);
    }
}
exports.CliRouter = CliRouter;
//# sourceMappingURL=cli-router.js.map