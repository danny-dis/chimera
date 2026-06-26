import { Command } from 'commander';
import * as readline from 'readline';
import { SessionOrchestrator, EventStream, LongTermMemory, CoordinatorEngine } from '@chimera/core';
import type { LLMProvider, OrchestratorResult, ToolExecutorInterface, ToolRegistryInterface } from '@chimera/core';
import type { Mode } from '@chimera/core';
import { ProviderFactory } from '@chimera/providers';
import type { ModelProvider } from '@chimera/providers';
import { CheckpointStore } from '@chimera/session';
import { ToolRegistry, ToolExecutor, allTools } from '@chimera/tools';
// @chimera/tui depends on Ink, which is ESM with top-level await.
// Loading it synchronously fails under Node ≥ 22 when this CJS module requires it.
// We import it dynamically inside `startTui()` instead.
import type { Message, Agent, CostData, EventLogEntry, TUIHandle } from '@chimera/tui';
import type { AgentRole } from '@chimera/core';

function adaptProvider(provider: ModelProvider): LLMProvider {
  return {
    async complete(messages, options) {
      const result = await provider.complete(
        messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: m.content,
        })),
        {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          responseFormat: options?.responseFormat,
        },
      );
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

export class CliRouter {
  private program: Command;
  private verbose = false;
  private sessionStore: CheckpointStore;
  private memory: LongTermMemory;

  constructor() {
    this.program = new Command();
    this.sessionStore = new CheckpointStore();
    this.memory = new LongTermMemory();
    this.setupCommands();
  }

  private async initOrchestrator(): Promise<SessionOrchestrator> {
    const eventStream = new EventStream();

    if (this.verbose) {
      eventStream.subscribe('*', (event) => {
        console.log(`  [event] ${event.type}`, JSON.stringify(event, null, 2));
      });
    }

    // Wire up tool system
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(
      registry,
      () => 'allow' as const, // Default: allow all tools
    );
    for (const tool of allTools) {
      registry.register(tool as Parameters<typeof registry.register>[0]);
    }

    return new SessionOrchestrator(
      eventStream,
      { registry: registry as unknown as ToolRegistryInterface, executor: executor as unknown as ToolExecutorInterface },
      process.cwd(),
    );
  }

  private async getProviders(): Promise<ModelProvider[]> {
    try {
      const providers = ProviderFactory.createFromEnv();
      const hasRealKeys = providers.some((p) => p.getModel().provider !== 'mock');
      if (!hasRealKeys) {
        console.log(
          '\n  ⚠ No API keys configured — using offline MockProvider. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to use a real model.\n',
        );
      }
      return providers;
    } catch (err) {
      console.error(
        `\n✗ Provider initialization failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
  }

  private async run(mode: Mode, task: string): Promise<void> {
    const label: Record<Mode, string> = {
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
    } catch (err) {
      console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  }

  private printResult(result: OrchestratorResult): void {
    const statusIcon: Record<string, string> = {
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

  private setupCommands(): void {
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
        } else {
          await this.startTui();
        }
      });

    this.program
      .command('ask <task>')
      .description('Ask a question')
      .option('--tui', 'use TUI for this task')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        if (options.tui) {
          await this.startTui(task, 'ask');
        } else {
          await this.run('ask', task);
        }
      });

    this.program
      .command('plan <task>')
      .description('Create a plan')
      .action(async (task: string) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('plan', task);
      });

    this.program
      .command('code <task>')
      .description('Write code')
      .action(async (task: string) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('code', task);
      });

    this.program
      .command('debug <task>')
      .description('Debug an issue')
      .action(async (task: string) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('debug', task);
      });

    this.program
      .command('review <task>')
      .description('Review code')
      .action(async (task: string) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('review', task);
      });

    this.program
      .command('parallel <task>')
      .description('Execute task with parallel sub-agents')
      .action(async (task: string) => {
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
      .action(async (sessionId: string) => {
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

  private async startTui(initialTask?: string, initialMode: Mode = 'code'): Promise<void> {
    // Lazy-load Ink/TUI: it's an ESM module with top-level await and cannot be
    // required() synchronously from this CJS CLI. Dynamic import keeps boot clean.
    const { runTUI } = await import('@chimera/tui');
    const providers = await this.getProviders();
    const writer = adaptProvider(providers[0]);
    const reviewer = adaptProvider(providers[1] ?? providers[0]);
    const orchestrator = await this.initOrchestrator();

    let currentMessages: Message[] = [];
    let currentAgents: Agent[] = [];
    let currentCostData: CostData = { currentCost: 0, budget: 10, breakdown: [] };
    let currentEvents: EventLogEntry[] = [];
    let currentMode: Mode = initialMode;

    const tui: TUIHandle = runTUI({
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
        } catch (err) {
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
        data: event as unknown as Record<string, unknown>
      }].slice(-50);

      // Update Agents
      if (event.type === 'agent_spawned') {
        currentAgents = [...currentAgents, {
          id: event.agentId,
          role: event.role as AgentRole,
          provider: event.provider,
          model: event.model,
          status: 'running',
          tokenUsage: { input: 0, output: 0 }
        }];
      } else if (event.type === 'verified' || event.type === 'challenged') {
        currentAgents = currentAgents.map(a => 
          a.id === event.agentId ? { ...a, status: 'completed' } : a
        );
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

  private async startRepl(): Promise<void> {
    console.log('\n  Chimera — interactive mode');
    console.log('  Type your task, or /help for commands.\n');

    let currentMode: Mode = 'code';
    let sessionId = this.sessionStore.generateSessionId();
    const history: string[] = [];

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

    rl.on('line', async (line: string) => {
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
              currentMode = args[0] as Mode;
              console.log(`  Mode: ${currentMode}`);
            } else {
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
            } else {
              history.forEach((h, i) => console.log(`  ${i + 1}. ${h.slice(0, 80)}`));
            }
            break;

          case 'sessions':
            const sessions = await this.sessionStore.list();
            if (sessions.length === 0) {
              console.log('  No saved sessions.');
            } else {
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
      } catch {
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
          } catch {
            // Memory storage is non-blocking
          }
        }

        // Auto-checkpoint after each turn
        const checkpoint = orchestrator.exportState(sessionId, input, currentMode) as Parameters<typeof this.sessionStore.save>[0];
        await this.sessionStore.save(checkpoint);
      } catch (err) {
        console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n  Goodbye.\n');
      process.exit(0);
    });
  }

  private async runParallel(task: string): Promise<void> {
    console.log(`\n⚙ Chimera [parallel] — decomposing task...\n`);

    const providers = await this.getProviders();
    const provider = adaptProvider(providers[0]);

    const eventStream = new EventStream();
    if (this.verbose) {
      eventStream.subscribe('*', (event) => {
        console.log(`  [event] ${event.type}`, JSON.stringify(event, null, 2));
      });
    }

    const coordinator = new CoordinatorEngine({ provider, eventStream });

    try {
      const result = await coordinator.execute(task, 'parallel execution');

      console.log(`\n✓ Status: ${result.resolved ? 'resolved' : 'conflict'}`);
      console.log(`  Sub-tasks: ${result.subTaskResults.length}`);
      console.log(`  Conflicts: ${result.conflicts.length}`);
      console.log(`  Tokens: ${result.totalTokens}`);
      console.log(`\n${result.output}\n`);
    } catch (err) {
      console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  async runCli(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }
}
