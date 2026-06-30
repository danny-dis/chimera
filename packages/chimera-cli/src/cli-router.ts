import { Command } from 'commander';
import * as readline from 'readline';
import { resolve } from 'path';
import { SessionOrchestrator, EventStream, LongTermMemory, CoordinatorEngine, runWorkflow } from '@chimera/core';
import type { LLMProvider, OrchestratorResult, ToolExecutorInterface, ToolRegistryInterface, WorkflowDefinition } from '@chimera/core';
import type { Mode, DeliberationMode } from '@chimera/core';
import { ProviderFactory } from '@chimera/providers';
import type { ModelProvider } from '@chimera/providers';
import { CheckpointStore } from '@chimera/session';
import { LearningEngine } from '@chimera/learning';
import { ToolRegistry, ToolExecutor, allTools } from '@chimera/tools';
import { runEval, formatEvalMarkdown } from './eval-runner.js';
import { runSlashCommand } from './commands/registry.js';
import type { ReplContext } from './commands/registry.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerWorkflowCommand } from './commands/workflow.js';
import { registerLearnCommand } from './commands/learn.js';
import { autoGenerateConfig, configExists, loadConfig, getProvidersByRole, type ResolvedProvider } from './config-loader.js';
import { cleanupStaleWorktrees, removeWorktree } from '@chimera/isolation';
// @chimera/tui depends on Ink, which is ESM with top-level await.
// Loading it synchronously fails under Node ≥ 22 when this CJS module requires it.
// We import it dynamically inside `startTui()` instead.
import type { Message, Agent, CostData, EventLogEntry, TUIHandle } from '@chimera/tui';
import type { ToolActivity } from '@chimera/tui';
import type { AgentRole } from '@chimera/core';

function adaptProvider(provider: ModelProvider): LLMProvider {
  return {
    async complete(messages, options) {
      const mappedMessages = messages.map((m) => {
        const extra = m as unknown as Record<string, unknown>;
        const msg: import('@chimera/providers').Message = {
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: m.content,
        };
        if (m.role === 'tool') {
          if (typeof extra.tool_call_id === 'string') {
            msg.toolResultId = extra.tool_call_id;
          } else {
            try {
              const parsed = JSON.parse(m.content);
              if (parsed.toolCallId) {
                msg.toolResultId = parsed.toolCallId;
              }
            } catch { /* content is not JSON — leave toolResultId undefined */ }
          }
        }
        if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
          msg.toolCalls = (extra.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }>).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          }));
        }
        return msg;
      });

      const result = await provider.complete(mappedMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat,
        tools: options?.tools,
        cacheControl: options?.cacheControl,
      });
      return {
        content: result.content,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: typeof tc.arguments === 'string'
            ? JSON.parse(tc.arguments)
            : tc.arguments,
        })),
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
  private noLearn = false;
  private sessionStore: CheckpointStore;
  private memory: LongTermMemory;
  private learningEngine: LearningEngine;

  constructor() {
    this.program = new Command();
    this.sessionStore = new CheckpointStore();
    this.memory = new LongTermMemory();
    const workspaceRoot = process.cwd();
    this.learningEngine = new LearningEngine({
      sessionDir: resolve(workspaceRoot, '.chimera', 'sessions'),
      outputDir: workspaceRoot,
      autoApply: true,
      minSessionsThreshold: 1,
    });
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
      registry.register(tool as unknown as Parameters<typeof registry.register>[0]);
    }

    return new SessionOrchestrator(
      eventStream,
      { registry: registry as unknown as ToolRegistryInterface, executor: executor as unknown as ToolExecutorInterface },
      process.cwd(),
    );
  }

  private buildProviderFromEntry(entry: ResolvedProvider): ModelProvider | null {
    try {
      return ProviderFactory.create({
        name: entry.name,
        provider: entry.provider,
        model: entry.model,
        apiKey: entry.apiKey,
        baseUrl: entry.baseUrl,
        role: entry.role,
        timeoutMs: entry.timeoutMs,
        constraints: {
          maxTokensPerTurn: 4096,
          costCapPerTask: 10,
          costCapPerSession: 20,
          costCapPerDay: 50,
          maxParallelInstances: 1,
          rateLimitRpm: 60,
        },
      });
    } catch (e) {
      console.error(
        `  ⚠ Provider "${entry.name}" (${entry.role}, ${entry.provider}/${entry.model}) skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Return providers mapped by role. Falls back to flat-array for backward compat.
   */
  private async getRoleMappedProviders(): Promise<{ writer?: ModelProvider; reviewer?: ModelProvider; challenger?: ModelProvider; fallback: ModelProvider[] }> {
    const config = loadConfig();
    if (config) {
      const byRole = getProvidersByRole(config);
      const writer = byRole.writer ? this.buildProviderFromEntry(byRole.writer) ?? undefined : undefined;
      const reviewer = byRole.reviewer ? this.buildProviderFromEntry(byRole.reviewer) ?? undefined : undefined;
      const challenger = byRole.challenger ? this.buildProviderFromEntry(byRole.challenger) ?? undefined : undefined;

      const fallback = [writer, reviewer, challenger].filter(Boolean) as ModelProvider[];
      if (fallback.length > 0) {
        return { writer, reviewer, challenger, fallback };
      }
      console.error(
        '\n  ⚠ All providers from .chimera/config.yaml failed. Check your config and API keys.\n',
      );
    }

    const fallback = ProviderFactory.createFromEnv();
    const hasRealKeys = fallback.some((p) => p.getModel().provider !== 'mock');
    if (!hasRealKeys) {
      console.log(
        '\n  ⚠ No API keys configured — using offline MockProvider. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to use a real model.\n',
      );
    }
    return { fallback };
  }

  private async getProviders(): Promise<ModelProvider[]> {
    try {
      const mapped = await this.getRoleMappedProviders();
      return mapped.fallback;
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
      auto: 'Auto-selecting',
    };

    console.log(`\n⚙ Chimera [${mode}] — ${label[mode]}...\n`);

    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        console.log(`  ✓ Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    const mapped = await this.getRoleMappedProviders();
    const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
    const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);
    const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;

    const orchestrator = await this.initOrchestrator();

    try {
      const result = await orchestrator.execute({
        task,
        mode,
        providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
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
    if (result.output && result.output.trim().length > 0) {
      console.log(`\n${result.output}\n`);
    } else {
      console.log(`\n⚠ Empty response. The model returned no content.`);
      console.log(`  Check your API key, model availability, and provider status.\n`);
    }
  }

  /**
   * Run the learning engine on a completed session checkpoint.
   * Fire-and-forget: errors are swallowed unless verbose mode is on.
   */
  private async learnFromCheckpoint(
    checkpoint: Parameters<LearningEngine['learnFromSession']>[0],
    eventStream: EventStream,
  ): Promise<void> {
    const report = await this.learningEngine.learnFromSession(checkpoint, eventStream);

    const totalCreated =
      report.skillsCreated.length +
      report.workflowsCreated.length +
      report.packsCreated.length;
    const totalUpdated =
      report.skillsUpdated.length +
      report.workflowsUpdated.length +
      report.packsUpdated.length;

    if (totalCreated === 0 && totalUpdated === 0) return;

    if (this.verbose) {
      console.log('  [learn] Learning completed:');
      for (const r of report.skillsCreated) {
        console.log(`    + skill: ${r.skill.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
      for (const r of report.workflowsCreated) {
        console.log(`    + workflow: ${r.workflow.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
      for (const r of report.packsCreated) {
        console.log(`    + skill-pack: ${r.pack.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
      for (const r of report.skillsUpdated) {
        console.log(`    ~ skill: ${r.skill.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
      for (const r of report.workflowsUpdated) {
        console.log(`    ~ workflow: ${r.workflow.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
    }
  }

  private setupCommands(): void {
    this.program
      .name('chimera')
      .description('Chimera — sovereign AI coding agent')
      .option('-v, --verbose', 'enable verbose event logging')
      .option('--no-learn', 'disable automatic learning after each session')
      .option('--repl', 'launch line-based REPL instead of the TUI dashboard')
      .action(async () => {
        const opts = this.program.opts();
        this.verbose = opts.verbose ?? false;
        this.noLearn = opts.learn === false;
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
      .command('loop <turns> <task>')
      .description('Run a task N times in a loop')
      .action(async (turnsStr: string, task: string) => {
        this.verbose = this.program.opts().verbose ?? false;
        const turns = parseInt(turnsStr, 10);
        if (isNaN(turns) || turns < 1) {
          console.error('\n✗ Invalid turn count. Must be a positive integer.\n');
          process.exit(1);
        }
        await this.runLoop(turns, task);
      });

    this.program
      .command('goal <description...>')
      .description('Run until a goal is achieved')
      .action(async (descParts: string[]) => {
        this.verbose = this.program.opts().verbose ?? false;
        const goal = descParts.join(' ');
        if (!goal) {
          console.error('\n✗ Goal description required.\n');
          process.exit(1);
        }
        await this.runGoal(goal);
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

        if (checkpoint.metadata.status === 'completed') {
          console.log('  Session already completed. Re-running task.\n');
          await this.run(checkpoint.mode, checkpoint.task);
          return;
        }

        const orchestrator = await this.initOrchestrator();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (orchestrator as any).restoreState(checkpoint as any);
        console.log(
          `  Restored ${(checkpoint as any).toolCallHistory?.length ?? 0} tool calls, ${checkpoint.metadata.turnCount} turns`,
        );

        const mapped = await this.getRoleMappedProviders();
        const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
        const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);
        const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;

        try {
          const result = await orchestrator.execute({
            task: checkpoint.task,
            mode: checkpoint.mode,
            providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
          });
          this.printResult(result);
        } catch (err) {
          console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      });

    // Subcommands from dedicated modules — see ./commands/skill.ts,
    // ./commands/workflow.ts, and ./commands/learn.ts.
    registerSkillCommand(this.program);
    registerWorkflowCommand(this.program);
    registerLearnCommand(this.program);

    this.program
      .command('eval <taskRef>')
      .description('Run evaluation on a task fixture')
      .option('-f, --fixtures-dir <dir>', 'directory containing task fixtures', 'fixtures/eval')
      .option('-m, --mode <mode>', 'evaluation mode', 'code')
      .option('--format <fmt>', 'output format (text or markdown)', 'text')
      .option('--real', 'execute real orchestrator run instead of synthetic trajectory')
      .action(async (taskRef: string, options: { fixturesDir: string; mode: string; format: string; real?: boolean }) => {
        try {
          let providers: { writer: ModelProvider; reviewer: ModelProvider } | undefined;
          if (options.real) {
            const mapped = await this.getRoleMappedProviders();
            providers = {
              writer: mapped.writer ?? mapped.fallback[0],
              reviewer: mapped.reviewer ?? mapped.writer ?? mapped.fallback[0],
            };
          }

          const report = await runEval(taskRef, {
            fixturesDir: options.fixturesDir,
            mode: options.mode as Mode,
            real: options.real,
            providers,
            workspaceRoot: process.cwd(),
          });

          if (options.format === 'markdown') {
            console.log(formatEvalMarkdown(report));
          } else {
            console.log(`\n  Eval Report — ${report.runId}`);
            console.log(`  Tasks: ${report.summary.totalTasks} | Pass: ${report.summary.passed} | Fail: ${report.summary.failed}`);
            console.log(`  Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`);
            console.log(`  Avg cost: $${report.summary.avgCost.toFixed(4)}`);
            console.log(`  Avg quality: ${(report.summary.avgQuality * 100).toFixed(1)}%`);
            console.log(`  Cost savings vs frontier: ${report.summary.costSavingsVsFrontier}%`);
            if (Object.keys(report.failureBreakdown).length > 0) {
              console.log(`\n  Failure breakdown:`);
              for (const [cat, n] of Object.entries(report.failureBreakdown)) {
                console.log(`    ${cat}: ${n}`);
              }
            }
            console.log();
          }
        } catch (err) {
          console.error(`\n✗ Eval failed: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      });

    this.program
      .command('cleanup')
      .description('Clean up stale worktrees')
      .option('-d, --dir <dir>', 'worktree directory to scan', '.chimera/worktrees')
      .option('-m, --max-age <ms>', 'maximum age in milliseconds', '604800000') // 7 days
      .option('-y, --yes', 'skip confirmation prompt')
      .action(async (options: { dir: string; maxAge: string; yes: boolean }) => {
        try {
          const worktreeDir = resolve(process.cwd(), options.dir);
          const maxAgeMs = parseInt(options.maxAge, 10);

          if (isNaN(maxAgeMs) || maxAgeMs <= 0) {
            console.error('\n✗ Invalid max-age value. Must be a positive integer.\n');
            process.exit(1);
          }

          console.log(`\n🔍 Scanning for stale worktrees in: ${worktreeDir}`);
          console.log(`  Max age: ${Math.round(maxAgeMs / 86400000)} days\n`);

          const staleWorktrees = await cleanupStaleWorktrees(worktreeDir, maxAgeMs);

          if (staleWorktrees.length === 0) {
            console.log('  ✓ No stale worktrees found.\n');
            return;
          }

          console.log(`  Found ${staleWorktrees.length} stale worktree(s):\n`);
          for (const wt of staleWorktrees) {
            console.log(`    - ${wt}`);
          }

          if (!options.yes) {
            const readline = await import('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            const answer = await new Promise<string>((resolve) => {
              rl.question('\n  Remove these worktrees? (y/N): ', resolve);
            });
            rl.close();

            if (answer.toLowerCase() !== 'y') {
              console.log('\n  Cleanup cancelled.\n');
              return;
            }
          }

          console.log('\n  Removing stale worktrees...');
          for (const wt of staleWorktrees) {
            try {
              await removeWorktree(wt);
              console.log(`    ✓ Removed: ${wt}`);
            } catch (err) {
              console.log(`    ✗ Failed to remove: ${wt} (${err instanceof Error ? err.message : String(err)})`);
            }
          }

          console.log('\n  ✓ Cleanup complete.\n');
        } catch (err) {
          console.error(`\n✗ Cleanup failed: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      });
  }

  private async startTui(initialTask?: string, initialMode: Mode = 'code'): Promise<void> {
    // Lazy-load Ink/TUI: it's an ESM module with top-level await and cannot be
    // required() synchronously from this CJS CLI. Dynamic import keeps boot clean.
    const { runTUI } = await import('@chimera/tui');

    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        console.log(`  ✓ Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    const mapped = await this.getRoleMappedProviders();
    const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
    const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);
    const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;
    const orchestrator = await this.initOrchestrator();
    const sessionId = this.sessionStore.generateSessionId();

    let currentMessages: Message[] = [];
    let currentAgents: Agent[] = [];
    let currentCostData: CostData = { currentCost: 0, budget: 10, breakdown: [] };
    let currentEvents: EventLogEntry[] = [];
    let currentMode: Mode = initialMode;
    let currentPreset: DeliberationMode = 'solo';
    let activeTool: ToolActivity | undefined;

    /** Build cost data from agent token usage. */
    const buildLiveCostData = (): CostData => {
      let inputTokens = 0;
      let outputTokens = 0;
      for (const agent of currentAgents) {
        inputTokens += agent.tokenUsage.input;
        outputTokens += agent.tokenUsage.output;
      }
      return {
        currentCost: 0,
        budget: 10,
        breakdown: [{
          provider: 'default',
          model: 'default',
          inputTokens,
          outputTokens,
          cost: 0,
        }],
      };
    };

    /** Load sessions from CheckpointStore for the SessionBrowser. */
    const loadSessions = async () => {
      try {
        const list = await this.sessionStore.list();
        return list.map((s) => ({
          id: s.id,
          date: new Date(s.timestamp),
          taskSummary: s.task ?? '',
          cost: s.cost ?? 0,
          messageCount: (s as unknown as { turnCount?: number }).turnCount ?? 0,
          agentCount: 0,
        }));
      } catch {
        return [];
      }
    };

    const workspaceRoot = process.cwd();

    const tui: TUIHandle = runTUI({
      mode: currentMode,
      preset: currentPreset,
      messages: currentMessages,
      agents: currentAgents,
      costData: currentCostData,
      events: currentEvents,
      sessions: await loadSessions(),
      sessionId,
      activeTool,
      workingDir: workspaceRoot,
      onSendMessage: async (text) => {
        // Reset agents at the start of each new task so they don't accumulate
        currentAgents = [];
        activeTool = undefined;

        currentMessages = [...currentMessages, {
          id: Math.random().toString(36).slice(2),
          role: 'user',
          content: text,
          timestamp: Date.now()
        }];
        tui.update({ messages: currentMessages, agents: currentAgents, activeTool: undefined });

        try {
          // TODO: Phase 2 — wire up WorkflowDispatcher for background execution
          await orchestrator.execute({
            task: text,
            mode: currentMode,
            providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
            preset: currentPreset,
          });

          // If the deliberation produced empty output (degraded provider),
          // surface a user-visible error instead of showing a blank response.
          const lastMsg = currentMessages[currentMessages.length - 1];
          if (lastMsg?.role === 'assistant' && (!lastMsg.content || lastMsg.content.trim().length === 0)) {
            const providerName = mapped.writer?.getModel()?.provider ?? 'unknown';
            const modelName = mapped.writer?.getModel()?.id ?? 'unknown';
            currentMessages = [
              ...currentMessages.slice(0, -1),
              {
                ...lastMsg,
                content: [
                  `The model returned an empty response.`,
                  `Provider: ${providerName} | Model: ${modelName}`,
                  ``,
                  `Possible causes:`,
                  `- Invalid or missing API key`,
                  `- Model not available or deprecated`,
                  `- Rate limit or quota exceeded`,
                  `- Content filter blocked the response`,
                  ``,
                  `Check your .chimera/config.yaml and environment variables.`,
                ].join('\n'),
                analysis: undefined,
              },
            ];
          }

          // Assistant message already added by event-stream handlers
          // (deliberation_result / final_response). Just sync state.
          tui.update({ messages: currentMessages });

          // Refresh cost and sessions after task completes
          currentCostData = buildLiveCostData();
          tui.update({
            costData: currentCostData,
            sessions: await loadSessions(),
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Show the error as an assistant message so the user sees it in chat
          currentMessages = [...currentMessages, {
            id: Math.random().toString(36).slice(2),
            role: 'assistant',
            content: `Error: ${errorMsg}`,
            timestamp: Date.now(),
          }];

          currentEvents = [...currentEvents, {
            id: Math.random().toString(36).slice(2),
            timestamp: Date.now(),
            type: 'error',
            message: errorMsg,
          }];
          tui.update({ messages: currentMessages, events: currentEvents });
        }
      },
      onModeChange: (mode) => {
        currentMode = mode;
        tui.update({ mode: currentMode });
      },
      onPresetChange: (preset) => {
        currentPreset = preset;
        tui.update({ preset: currentPreset });
      },
      onSessionSelect: async (id) => {
        try {
          const cp = await this.sessionStore.load(id);
          if (cp) {
            currentMode = cp.mode;
            // Append a system message indicating resume
            currentMessages = [...currentMessages, {
              id: Math.random().toString(36).slice(2),
              role: 'system',
              content: `Session ${id} loaded: ${cp.task.slice(0, 80)}`,
              timestamp: Date.now(),
            }];
            tui.update({ mode: cp.mode, messages: currentMessages });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tui.update({ messages: [{ id: Math.random().toString(36).slice(2), role: 'system', content: `Failed to load session: ${msg}`, timestamp: Date.now() }] });
        }
      },
      onSessionDelete: async (id) => {
        try {
          await this.sessionStore.delete(id);
          tui.update({ sessions: await loadSessions() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tui.update({ messages: [{ id: Math.random().toString(36).slice(2), role: 'system', content: `Failed to delete session: ${msg}`, timestamp: Date.now() }] });
        }
      },
      onExit: () => {
        tui.cleanup();
        process.exit(0);
      },
    });

    // Subscribe to events and update TUI state
    orchestrator.getEventStream().subscribe('*', (event) => {
      // ── Events log ──────────────────────────────────────────────────
      currentEvents = [...currentEvents, {
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
        type: event.type,
        message: 'text' in event ? (event as any).text : event.type,
        data: event as unknown as Record<string, unknown>
      }].slice(-50);

      // ── Agent lifecycle ─────────────────────────────────────────────
      if (event.type === 'agent_spawned') {
        currentAgents = [...currentAgents, {
          id: event.agentId,
          role: event.role as AgentRole,
          provider: event.provider,
          model: event.model,
          status: 'running' as const,
          tokenUsage: { input: 0, output: 0 }
        }];
      } else if (event.type === 'verified' || event.type === 'challenged') {
        currentAgents = currentAgents.map(a =>
          a.id === event.agentId ? { ...a, status: 'completed' as const } : a
        );
      }

      // ── Workflow dispatch lifecycle ────────────────────────────────
      if (event.type === 'workflow_dispatched') {
        const e = event as any;
        currentMessages = [...currentMessages, {
          id: Math.random().toString(36).slice(2),
          role: 'system',
          content: `Workflow "${e.workflowName}" queued (run: ${e.workflowRunId})`,
          timestamp: Date.now()
        }];
        tui.update({ messages: currentMessages });
      } else if (event.type === 'workflow_run_completed') {
        const e = event as any;
        currentMessages = [...currentMessages, {
          id: Math.random().toString(36).slice(2),
          role: 'system',
          content: `Workflow "${e.name}" ${e.status} (${e.durationMs}ms, ${e.stepCount} steps)`,
          timestamp: Date.now()
        }];
        tui.update({ messages: currentMessages });
      } else if (event.type === 'workflow_dispatch_failed') {
        const e = event as any;
        currentMessages = [...currentMessages, {
          id: Math.random().toString(36).slice(2),
          role: 'system',
          content: `Workflow "${e.workflowName}" failed: ${e.error}`,
          timestamp: Date.now()
        }];
        tui.update({ messages: currentMessages });
      }

      // ── Tool activity (live indicator) ──────────────────────────────
      if (event.type === 'tool_call_requested') {
        const call = (event as any).call as { tool?: string; args?: Record<string, unknown> } | undefined;
        activeTool = {
          tool: call?.tool ?? 'unknown',
          args: call?.args ? JSON.stringify(call.args).slice(0, 40) : undefined,
          status: 'running',
          startedAt: Date.now(),
        };
        // Also push a tool-call indicator onto the current/last assistant message
        const lastMsg = currentMessages[currentMessages.length - 1];
        if (lastMsg?.role === 'assistant') {
          currentMessages = [
            ...currentMessages.slice(0, -1),
            {
              ...lastMsg,
              toolCalls: [
                ...(lastMsg.toolCalls ?? []),
                { name: call?.tool ?? 'unknown', status: 'running' as const, args: call?.args ? JSON.stringify(call.args).slice(0, 60) : undefined },
              ],
            },
          ];
        }
      } else if (event.type === 'tool_call_result') {
        const result = (event as any).result as { tool?: string; output?: string; exitCode?: number } | undefined;
        activeTool = {
          tool: result?.tool ?? 'unknown',
          status: 'completed',
          startedAt: Date.now(),
        };
        // Update the matching tool-call indicator on the last assistant message
        const lastMsg = currentMessages[currentMessages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
          const updatedCalls = lastMsg.toolCalls.map((tc) =>
            tc.name === result?.tool && tc.status === 'running'
              ? { ...tc, status: 'completed' as const, result: result?.exitCode !== undefined ? `exit ${result.exitCode}` : undefined }
              : tc
          );
          currentMessages = [
            ...currentMessages.slice(0, -1),
            { ...lastMsg, toolCalls: updatedCalls },
          ];
        }
      }

      // ── Live cost from cost_alert events ────────────────────────────
      if (event.type === 'cost_alert') {
        // Update cost data from orchestrator
        currentCostData = buildLiveCostData();
      }

      // ── Deliberation result (detailed analysis) ────────────────────
      if (event.type === 'deliberation_result') {
        const lastMsg = currentMessages[currentMessages.length - 1];
        const output = (event as any).output ?? '';
        // Only attach analysis when there is actual content to display;
        // empty output with analysis metadata is confusing to the user.
        const hasContent = output.trim().length > 0;
        const analysis = hasContent ? (event as any).analysis : undefined;

        if (lastMsg && lastMsg.role === 'assistant') {
          currentMessages = [
            ...currentMessages.slice(0, -1),
            { ...lastMsg, content: output, analysis }
          ];
        } else {
          currentMessages = [...currentMessages, {
            id: Math.random().toString(36).slice(2),
            role: 'assistant',
            content: output,
            analysis,
            timestamp: Date.now()
          }];
        }
      }

      // ── Final response ──────────────────────────────────────────────
      if (event.type === 'final_response') {
        const lastMsg = currentMessages[currentMessages.length - 1];
        const eventOutput = (event as any).output;
        const content = (eventOutput && eventOutput.trim().length > 0)
          ? eventOutput
          : (lastMsg?.role === 'assistant' ? lastMsg.content : 'Task completed.');

        // Update cost from the final_response cost field
        if ((event as any).cost !== undefined) {
          currentCostData = buildLiveCostData();
        }

        if (lastMsg && lastMsg.role === 'assistant') {
          currentMessages = [
            ...currentMessages.slice(0, -1),
            { ...lastMsg, content, timestamp: Date.now() }
          ];
        } else {
          currentMessages = [...currentMessages, {
            id: Math.random().toString(36).slice(2),
            role: 'assistant',
            content,
            timestamp: Date.now()
          }];
        }

        // Clear active tool when task finishes
        activeTool = undefined;
      }

      tui.update({
        events: currentEvents,
        agents: currentAgents,
        messages: currentMessages,
        costData: currentCostData,
        activeTool,
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
        providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
        preset: currentPreset,
      });

      // Refresh cost after initial task
      currentCostData = buildLiveCostData();
      tui.update({ costData: currentCostData, sessions: await loadSessions() });
    }

    await tui.waitUntilExit();
  }

  private async startRepl(): Promise<void> {
    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        console.log(`  ✓ Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    console.log('\n  Chimera — interactive mode');
    console.log('  Type your task, or /help for commands.\n');

    let currentMode: Mode = 'code';
    let currentPreset: DeliberationMode = 'solo';
    let sessionId = this.sessionStore.generateSessionId();
    const history: string[] = [];
    const conversationHistory: Array<{ role: string; content: string }> = [];
    let loopState: { kind: 'loop' | 'goal'; task: string; maxIterations: number; currentIteration: number; status: 'running' | 'completed' | 'failed'; startedAt: number } | null = null;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'chimera> ',
    });

    // Build a ReplContext that bridges local state to the registry handlers
    const replCtx: ReplContext = {
      getMode: () => currentMode,
      setMode: (m) => { currentMode = m; },
      sessionId,
      history,
      latestReplResult: null,
      setLatestReplResult: () => {},
      currentOrchestrator: null,
      setCurrentOrchestrator: () => {},
      getLoopState: () => loopState,
      setLoopState: (s) => { loopState = s; },
      memory: this.memory,
      adaptProvider,
      getProviders: () => this.getProviders(),
      getSessionStore: () => this.sessionStore,
      printResult: (r) => this.printResult(r),
      initOrchestrator: () => this.initOrchestrator(),
    };

    rl.prompt();

    rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      // Delegate slash commands to the registry
      if (input.startsWith('/')) {
        const [cmd, ...args] = input.slice(1).split(/\s+/);
        const signal = await runSlashCommand(cmd!, args, replCtx);
        if (signal === 'exit') {
          rl.close();
          process.exit(0);
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

    const mapped = await this.getRoleMappedProviders();
    if (mapped.fallback.length === 0) {
      console.error('\n✗ No providers available. Configure API keys.\n');
      process.exit(1);
    }
    const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
    const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);
    const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;

      const orchestrator = await this.initOrchestrator();

      try {
        const taskWithContext = memoryContext ? `${input}${memoryContext}` : input;
        const result = await orchestrator.execute({
          task: taskWithContext,
          mode: currentMode,
          providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
          preset: currentPreset,
          conversationHistory,
        });

        this.printResult(result);

        // Accumulate conversation history for context
        if (result.output && result.status === 'done') {
          conversationHistory.push({ role: 'user', content: input });
          conversationHistory.push({ role: 'assistant', content: result.output.slice(0, 2000) });
        }

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

        // Auto-learn: synthesize skills, workflows, and skill packs from this session
        if (!this.noLearn) {
          this.learnFromCheckpoint(checkpoint, orchestrator['eventStream']).catch((err) => {
            // Learning is best-effort; never block the REPL
            if (this.verbose) {
              console.log(`  [learn] error: ${err instanceof Error ? err.message : String(err)}`);
            }
          });
        }
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

    const mapped = await this.getRoleMappedProviders();
    const provider = adaptProvider(mapped.writer ?? mapped.fallback[0]);

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

  private async runLoop(turns: number, task: string): Promise<void> {
    console.log(`\n⟳ Chimera loop — running "${task}" ${turns} time(s)...\n`);

    const mapped = await this.getRoleMappedProviders();
    const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
    const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);

    const loopWf: WorkflowDefinition = {
      name: 'cli-loop',
      steps: [{
        id: 'loop',
        kind: 'loop',
        config: {
          prompt: task,
          until: 'COMPLETE',
          max_iterations: turns,
          fresh_context: true,
          role: 'writer',
        },
      }],
    };

    const result = await runWorkflow(loopWf, {
      handlers: { providers: { writer, reviewer } },
    });

    if (result.status === 'success') {
      const out = result.outputs.loop as { content: string; iterations: number };
      console.log(`  ✓ Completed after ${out.iterations} iteration(s)\n${out.content}\n`);
    } else {
      console.error(`\n✗ Loop failed: ${result.error}\n`);
      process.exit(1);
    }
  }

  private async runGoal(goal: string): Promise<void> {
    console.log(`\n◎ Chimera goal — "${goal}"\n`);

    const mapped = await this.getRoleMappedProviders();
    const writer = adaptProvider(mapped.writer ?? mapped.fallback[0]);
    const reviewer = adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]);

    const goalWf: WorkflowDefinition = {
      name: 'cli-goal',
      steps: [{
        id: 'goal',
        kind: 'loop',
        config: {
          prompt: `Work on this goal: ${goal}\n\nWhen the goal is fully achieved, end your response with the word COMPLETE.`,
          until: 'COMPLETE',
          max_iterations: 20,
          fresh_context: true,
          role: 'writer',
        },
      }],
    };

    const result = await runWorkflow(goalWf, {
      handlers: { providers: { writer, reviewer } },
    });

    if (result.status === 'success') {
      const out = result.outputs.goal as { content: string; iterations: number };
      console.log(`  ✓ Goal achieved after ${out.iterations} iteration(s)\n${out.content}\n`);
    } else {
      console.error(`\n✗ Goal not achieved: ${result.error}\n`);
      process.exit(1);
    }
  }

  /** Print the full list of supported modes to stdout. Used by tests. */
  printModeList(): void {
    const modes = ['ask', 'plan', 'code', 'debug', 'review', 'oal', 'auto'];
    console.log(`  Available modes: ${modes.join(', ')}`);
  }

  async runCli(argv: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }
}
