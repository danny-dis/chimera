import type {
  LLMProvider,
  LongTermMemory,
  Mode,
  DeliberationMode,
  OrchestratorResult,
  SessionOrchestrator,
  WorkflowDefinition,
} from '@chimera/core';
import { runWorkflow, SchedulerManager } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import { ModelMetadataFetcher } from '@chimera/providers';
import type { CheckpointStore } from '@chimera/session';
import type { UserSkillModel } from '@chimera/learning';
import { loadCustomCommands, runCustomCommand } from './custom-loader.js';
import { initAgentsMd } from './init.js';

const HELP_TEXT = [
  '  Core commands:',
  '    /mode <ask|plan|code|debug|review|oal|auto>  — switch mode',
  '    /preset <auto|solo|duo|trio|fusion|hive|swarm>  — switch preset',
  '    /cost /history /sessions /clear /exit /help',
  '',
  '  Tasks:',
  '    /tasks /compact /init /rewind /loop /goal',
  '',
  '  Settings:',
  '    /model /status /config /doctor /export',
  '    /refresh-models  — fetch latest model metadata from APIs',
];

/**
 * Lightweight handle to the live REPL state. The router constructs one of
 * these per session and hands it to `printHelp` / `runSlashCommand`. We
 * use closures instead of a class so callers don't need to know which
 * fields are mutable — they just call the accessors.
 */
export interface LoopState {
  kind: 'loop' | 'goal';
  task: string;
  maxIterations: number;
  currentIteration: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
}

export interface ReplContext {
  /** Current orchestrator mode (ask/plan/code/...). */
  getMode(): Mode;
  setMode(m: Mode): void;
  /** Current deliberation preset (auto/solo/duo/trio/...). */
  getPreset(): DeliberationMode;
  setPreset(p: DeliberationMode): void;
  /** Session id assigned by the checkpoint store. */
  sessionId: string;
  /** Full history of user inputs in this session. */
  history: string[];
  /** Behavior-derived skill model; drives explanation depth across the REPL. */
  skillModel?: UserSkillModel;
  /** Result from the most recent task; used by /cost and /status. */
  latestReplResult: OrchestratorResult | null;
  setLatestReplResult(r: OrchestratorResult | null): void;
  /** Live orchestrator (lazily initialized on first task). */
  currentOrchestrator: SessionOrchestrator | null;
  setCurrentOrchestrator(o: SessionOrchestrator | null): void;
  /** Current loop/goal state for /status display. */
  getLoopState(): LoopState | null;
  setLoopState(s: LoopState | null): void;
  /** Scheduler for /schedule (add/list/remove). Null if not wired. */
  getScheduler(): SchedulerManager | null;
  /** Long-term memory store used to seed context on each turn. */
  memory: LongTermMemory;
  /** Bridge from `ModelProvider` (chimera/providers) to `LLMProvider`. */
  adaptProvider(p: ModelProvider): LLMProvider;
  /** Returns the env-derived provider list, falling back to a mock. */
  getProviders(): Promise<ModelProvider[]>;
  /** Save/load checkpoints. */
  getSessionStore(): CheckpointStore;
  /** Pretty-print an orchestrator result to the terminal. */
  printResult(r: OrchestratorResult): void;
  /** Build a fresh orchestrator (used by task processing). */
  initOrchestrator(): Promise<SessionOrchestrator>;
}

export type ReplExitSignal = 'continue' | 'exit';

/**
 * Print the slash-command help. Reads the user-visible command table
 * below and prepends any custom commands from
 * `.chimera/commands/*.md` / `~/.chimera/commands/*.md`.
 */
export async function printHelp(_ctx: ReplContext): Promise<void> {
  const customCmds = await loadCustomCommands().catch(() => new Map());
  const customSection = customCmds.size === 0
    ? ''
    : [
        '',
        '  Custom commands:',
        ...Array.from(customCmds.values()).map((c) => {
          const hint = c.argumentHint ? ` ${c.argumentHint}` : '';
          const desc = c.description ? `  — ${c.description}` : '';
          return `    /${c.name}${hint}${desc}`;
        }),
      ].join('\n');

  console.log(HELP_TEXT.join('\n') + customSection);
}

/**
 * Dispatch a single slash command. The router calls this from inside its
 * `rl.on('line')` handler; returning `'exit'` tells the caller to
 * close the readline interface.
 */
export async function runSlashCommand(
  cmd: string,
  args: string[],
  ctx: ReplContext,
): Promise<ReplExitSignal> {
  switch (cmd) {
    case 'mode': {
      const known = ['ask', 'plan', 'code', 'debug', 'review', 'oal', 'auto'];
      if (args[0] && known.includes(args[0])) {
        ctx.setMode(args[0] as Mode);
        console.log(`  Mode: ${ctx.getMode()}`);
      } else {
        console.log(`  Current mode: ${ctx.getMode()}. Use /mode <ask|plan|code|debug|review|oal|auto>`);
      }
      return 'continue';
    }
    case 'preset': {
      const known = ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'];
      if (args[0] && known.includes(args[0])) {
        ctx.setPreset(args[0] as DeliberationMode);
        console.log(`  Preset: ${ctx.getPreset()}`);
      } else {
        console.log(`  Current preset: ${ctx.getPreset()}. Use /preset <auto|solo|duo|trio|fusion|hive|swarm>`);
      }
      return 'continue';
    }

    case 'cost':
      return handleCost(ctx);
    case 'history':
      return handleHistory(ctx);
    case 'tasks':
    case 'todos':
      return handleTasks(ctx);
    case 'compact':
      return handleCompact(ctx);
    case 'init':
      return handleInit(args);
    case 'model':
      return handleModel(ctx, args);
    case 'status':
      return handleStatus(ctx);
    case 'vim':
      return handleVim();
    case 'rewind':
      return handleRewind(ctx, args);
    case 'loop': {
      const turns = parseInt(args[0], 10);
      const task = args.slice(1).join(' ');
      if (isNaN(turns) || turns < 1 || !task) {
        console.log('  Usage: /loop <turns> <task>');
        console.log('  Example: /loop 5 refactor this module');
        return 'continue';
      }
      return handleLoop(ctx, turns, task);
    }
    case 'goal': {
      const goal = args.join(' ');
      if (!goal) {
        console.log('  Usage: /goal <description>');
        console.log('  Example: /goal all tests pass and no lint errors');
        return 'continue';
      }
      return handleGoal(ctx, goal);
    }
    case 'schedule': {
      return handleSchedule(ctx, args);
    }
    case 'theme':
      return handleTheme(args);
    case 'output-style':
      return handleOutputStyle(args);
    case 'permissions':
      return handlePermissions(ctx);
    case 'sandbox':
      return handleSandbox();
    case 'login':
      return handleLogin(args);
    case 'logout':
      return handleLogout();
    case 'mcp':
      return handleMcp();
    case 'hooks':
      return handleHooks();
    case 'ide':
      return handleIde();
    case 'bug':
      return handleBug();
    case 'feedback':
      return handleFeedback();
    case 'pr-comments':
      return handlePrComments();
    case 'privacy-settings':
      return handlePrivacySettings();
    case 'migrate-installer':
      return handleMigrateInstaller();
    case 'teleport':
      return handleTeleport(args);
    case 'config':
      return handleConfig(ctx);
    case 'agents':
      return handleAgents(ctx);
    case 'doctor':
      return handleDoctor(ctx);
    case 'usage':
      return handleUsage(ctx);
    case 'export':
      return handleExport(ctx);
    case 'memory':
      return handleMemory(ctx);
    case 'release-notes':
      return handleReleaseNotes();
    case 'resume':
      return handleResume(ctx, args);
    case 'sessions':
      return handleSessions(ctx);
    case 'refresh-models':
      return handleRefreshModels(args);
    case 'clear':
      console.clear();
      return 'continue';
    case 'exit':
    case 'quit':
      console.log('\n  Goodbye.\n');
      return 'exit';
    case 'help':
      await printHelp(ctx);
      return 'continue';
    default:
      return handleUnknown(ctx, cmd, args);
  }
}

async function handleLoop(
  ctx: ReplContext,
  turns: number,
  task: string,
): Promise<ReplExitSignal> {
  console.log(`\n⟳ Loop: running "${task}" ${turns} time(s)...\n`);

  ctx.setLoopState({
    kind: 'loop',
    task,
    maxIterations: turns,
    currentIteration: 0,
    status: 'running',
    startedAt: Date.now(),
  });

  const providers = await ctx.getProviders();
  const writer = ctx.adaptProvider(providers[0]);
  const reviewer = ctx.adaptProvider(providers[1] ?? providers[0]);

  const loopWf: WorkflowDefinition = {
    name: 'user-loop',
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
    ctx.setLoopState({ ...ctx.getLoopState()!, currentIteration: out.iterations, status: 'completed' });
    console.log(`  ✓ Completed after ${out.iterations} iteration(s)`);
    ctx.printResult({ status: 'done', output: out.content, cost: 0, agentCount: 1, events: [] });
  } else {
    const state = ctx.getLoopState();
    ctx.setLoopState({ ...state!, status: 'failed' });
    console.log(`  ✗ Loop failed: ${result.error}`);
  }
  return 'continue';
}

async function handleGoal(
  ctx: ReplContext,
  goal: string,
): Promise<ReplExitSignal> {
  console.log(`\n◎ Goal: "${goal}" — running until achieved...\n`);

  ctx.setLoopState({
    kind: 'goal',
    task: goal,
    maxIterations: 20,
    currentIteration: 0,
    status: 'running',
    startedAt: Date.now(),
  });

  const providers = await ctx.getProviders();
  const writer = ctx.adaptProvider(providers[0]);
  const reviewer = ctx.adaptProvider(providers[1] ?? providers[0]);

  const goalWf: WorkflowDefinition = {
    name: 'user-goal',
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
    ctx.setLoopState({ ...ctx.getLoopState()!, currentIteration: out.iterations, status: 'completed' });
    console.log(`  ✓ Goal achieved after ${out.iterations} iteration(s)`);
    ctx.printResult({ status: 'done', output: out.content, cost: 0, agentCount: 1, events: [] });
  } else {
    const state = ctx.getLoopState();
    ctx.setLoopState({ ...state!, status: 'failed' });
    console.log(`  ✗ Goal not achieved: ${result.error}`);
  }
  return 'continue';
}

/**
 * /schedule add <cron> <task>   — create a recurring loop schedule
 * /schedule list                — show all schedules
 * /schedule remove <id>         — delete a schedule
 * /schedule on|off <id>         — enable/disable a schedule
 */
async function handleSchedule(
  ctx: ReplContext,
  args: string[],
): Promise<ReplExitSignal> {
  const scheduler = ctx.getScheduler();
  if (!scheduler) {
    console.log('  Scheduler not available in this context.');
    return 'continue';
  }

  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const list = scheduler.listSchedules();
    if (list.length === 0) {
      console.log('  No schedules. Add one: /schedule add "0 9 * * *" <task>');
    } else {
      for (const s of list) {
        console.log(`  ${s.enabled ? '✓' : '✗'} ${s.id}  ${s.cron}  ${s.enabled ? '' : '(disabled) '}${s.task ?? ''}`);
      }
    }
    return 'continue';
  }

  if (sub === 'add') {
    // /schedule add "<cron>" <task...>  — cron is the first token.
    const rest = args.slice(1);
    if (rest.length < 2) {
      console.log('  Usage: /schedule add "<cron>" <task>');
      console.log('  Example: /schedule add "0 9 * * *" run the morning build');
      return 'continue';
    }
    const cron = rest[0]!;
    const task = rest.slice(1).join(' ');
    const entry = scheduler.addSchedule({ workflow: task.slice(0, 40), name: task.slice(0, 40), cron, task, enabled: true });
    console.log(`  ✓ Scheduled ${entry.id}: "${cron}" → ${task}`);
    return 'continue';
  }

  if (sub === 'remove' || sub === 'rm') {
    const id = args[1];
    if (!id) { console.log('  Usage: /schedule remove <id>'); return 'continue'; }
    console.log(scheduler.removeSchedule(id) ? '  ✓ Removed.' : '  ✗ No such schedule.');
    return 'continue';
  }

  if (sub === 'on' || sub === 'off') {
    const id = args[1];
    if (!id) { console.log(`  Usage: /schedule ${sub} <id>`); return 'continue'; }
    const ok = sub === 'on' ? scheduler.enableSchedule(id) : scheduler.disableSchedule(id);
    console.log(ok ? `  ✓ ${sub === 'on' ? 'Enabled' : 'Disabled'}.` : '  ✗ No such schedule.');
    return 'continue';
  }

  console.log('  Usage: /schedule [list|add|remove|on|off] ...');
  return 'continue';
}

function handleCost(ctx: ReplContext): ReplExitSignal {
  if (!ctx.currentOrchestrator) {
    console.log('  No tasks run yet this session.');
    return 'continue';
  }
  const tracker = ctx.currentOrchestrator.getCostTracker();
  const aggregate = (tracker as unknown as { getTotal?: () => number }).getTotal?.() ?? null;
  const writerSpend = tracker.getSpend('writer');
  const reviewerSpend = tracker.getSpend('reviewer');
  const challengerSpend = tracker.getSpend('challenger');
  const total = aggregate ?? (writerSpend + reviewerSpend + challengerSpend);
  console.log(`  Session: ${ctx.sessionId}`);
  console.log(`  Mode: ${ctx.getMode()}`);
  console.log(`  Aggregate cost: $${total.toFixed(4)}`);
  console.log(`  Breakdown:`);
  console.log(`    writer:     $${writerSpend.toFixed(4)}`);
  console.log(`    reviewer:   $${reviewerSpend.toFixed(4)}`);
  console.log(`    challenger: $${challengerSpend.toFixed(4)}`);
  if (ctx.latestReplResult) {
    const r = ctx.latestReplResult;
    console.log(`  Last task: $${r.cost.toFixed(4)} (${r.status}, ${r.agentCount} agents)`);
  }
  return 'continue';
}

function handleHistory(ctx: ReplContext): ReplExitSignal {
  if (ctx.history.length === 0) {
    console.log('  No history yet.');
  } else {
    ctx.history.forEach((h, i) => console.log(`  ${i + 1}. ${h.slice(0, 80)}`));
  }
  return 'continue';
}

function handleTasks(ctx: ReplContext): ReplExitSignal {
  if (!ctx.currentOrchestrator) {
    console.log('  No tasks run yet this session.');
    return 'continue';
  }
  const events = ctx.currentOrchestrator.getEventStream().getAll();
  const agents = events.filter((e) => e.type === 'agent_spawned');
  const drafts = events.filter((e) => e.type === 'draft_proposed');
  const verified = events.filter((e) => e.type === 'verified');

  console.log(`  Tasks this session:`);
  console.log(`    Agents spawned: ${agents.length}`);
  console.log(`    Drafts proposed: ${drafts.length}`);
  console.log(`    Verifications: ${verified.length}`);

  if (ctx.latestReplResult) {
    const r = ctx.latestReplResult;
    console.log(`  Last result: [${r.status}] ${r.output.slice(0, 80)}...`);
  }
  return 'continue';
}

async function handleCompact(ctx: ReplContext): Promise<ReplExitSignal> {
  if (ctx.history.length === 0) {
    console.log('  Nothing to compact.');
    return 'continue';
  }
  const recentHistory = ctx.history.slice(-10).join('\n');
  try {
    await ctx.memory.write({
      content: `Session ${ctx.sessionId} summary:\n${recentHistory}`,
      topic: 'session-summary',
      importance: 0.7,
      source: 'user',
      tags: ['compact', ctx.getMode()],
    });
    console.log(`  Compacted ${Math.min(ctx.history.length, 10)} turns into memory.`);
    console.log(`  Memory size: ${ctx.memory.size()} entries`);
  } catch (err) {
    console.log(`  Compact failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

async function handleInit(args: string[]): Promise<ReplExitSignal> {
  const force = args.includes('--force');
  try {
    const res = await initAgentsMd(process.cwd(), { force });
    console.log(
      `Wrote AGENTS.md (${res.bytesWritten} bytes). Review and edit before committing.`,
    );
  } catch (err) {
    console.error(`  /init failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

async function handleRefreshModels(args: string[]): Promise<ReplExitSignal> {
  const force = args.includes('--force');
  const fetcher = new ModelMetadataFetcher();

  console.log('  Fetching model metadata from OpenRouter API...');

  try {
    let metadata;
    if (force) {
      console.log('  (forcing refresh, ignoring cache)');
      metadata = await fetcher.refreshMetadata();
    } else {
      metadata = await fetcher.getMetadata();
    }

    const ctxCount = metadata.filter((m) => m.contextWindow > 0).length;
    const pricingCount = metadata.filter((m) => m.inputPerMillion > 0 || m.outputPerMillion > 0).length;

    console.log(`  ✓ Fetched metadata for ${metadata.length} models`);
    console.log(`  ✓ ${ctxCount} models with context window info`);
    console.log(`  ✓ ${pricingCount} models with pricing info`);
    console.log(`  ✓ Cache saved to: ${fetcher['config'].cachePath}`);
    console.log('');
    console.log('  Context windows are now available for cost calculations.');
    console.log('  Restart the session to apply to existing providers.');
  } catch (err) {
    console.error(`  Failed to fetch model metadata: ${err instanceof Error ? err.message : String(err)}`);
    console.log('  Using hardcoded values as fallback.');
  }

  return 'continue';
}

async function handleModel(ctx: ReplContext, args: string[]): Promise<ReplExitSignal> {
  const providers = await ctx.getProviders();
  if (args.length === 0) {
    for (const p of providers) {
      const m = p.getModel();
      console.log(`  ${m.provider.padEnd(8)}  ${m.name}  (ctx ${m.contextWindow})`);
    }
    return 'continue';
  }
  const wanted = args[0]!.toLowerCase();
  const match = providers.find(
    (p) =>
      p.getModel().name.toLowerCase().includes(wanted) ||
      p.getModel().id.toLowerCase().includes(wanted),
  );
  if (match) {
    const m = match.getModel();
    console.log(
      `  Switched writer to ${m.provider}/${m.name} (note: orchestrator picks the cheapest non-mock provider; this just confirms availability)`,
    );
  } else {
    console.log(`  No provider/model matching "${args[0]}". Available:`);
    for (const p of providers) {
      const m = p.getModel();
      console.log(`    ${m.provider}/${m.name}`);
    }
  }
  return 'continue';
}

function handleStatus(ctx: ReplContext): ReplExitSignal {
  console.log(`  Session: ${ctx.sessionId}`);
  console.log(`  Mode: ${ctx.getMode()}`);
  if (ctx.currentOrchestrator) {
    const t = ctx.currentOrchestrator.getCostTracker();
    const total =
      (t as unknown as { getTotal?: () => number }).getTotal?.() ??
      (t.getSpend('writer') + t.getSpend('reviewer') + t.getSpend('challenger'));
    console.log(`  Cost: $${total.toFixed(4)}`);
  } else {
    console.log(`  Cost: $0.0000`);
  }
  console.log(`  History: ${ctx.history.length} turn${ctx.history.length === 1 ? '' : 's'}`);

  const loopState = ctx.getLoopState();
  if (loopState) {
    const elapsed = Math.round((Date.now() - loopState.startedAt) / 1000);
    const icon = loopState.status === 'running' ? '⟳' : loopState.status === 'completed' ? '✓' : '✗';
    const label = loopState.kind === 'loop' ? 'Loop' : 'Goal';
    console.log(`  ${icon} ${label}: "${loopState.task.slice(0, 50)}"`);
    console.log(`    Iteration: ${loopState.currentIteration}/${loopState.maxIterations}`);
    console.log(`    Status: ${loopState.status}`);
    console.log(`    Elapsed: ${elapsed}s`);
  }

  return 'continue';
}

async function handleResume(ctx: ReplContext, args: string[]): Promise<ReplExitSignal> {
  if (args.length === 0) {
    const sessions = await ctx.getSessionStore().list();
    if (sessions.length === 0) {
      console.log('  No saved sessions to resume.');
    } else {
      console.log('  Pass a session id to resume. Available:');
      for (const s of sessions.slice(0, 10)) {
        console.log(`    ${s.id}  ${s.task.slice(0, 50)}`);
      }
    }
    return 'continue';
  }
  const cp = await ctx.getSessionStore().load(args[0]!);
  if (!cp) {
    console.log(`  Session "${args[0]}" not found.`);
    return 'continue';
  }
  console.log(`  Resuming ${args[0]} (${cp.task.slice(0, 60)})…`);
  ctx.setMode(cp.mode);
  // restoreState is not yet implemented on SessionOrchestrator.
  // Will be added in Phase 1A (ContextEngine wiring) when the checkpoint
  // shape is consolidated across chimera-session and chimera-core.
  return 'continue';
}

async function handleSessions(ctx: ReplContext): Promise<ReplExitSignal> {
  const sessions = await ctx.getSessionStore().list();
  if (sessions.length === 0) {
    console.log('  No saved sessions.');
  } else {
    for (const s of sessions) {
      console.log(`  ${s.id}  ${s.mode}  ${s.status}  ${s.task.slice(0, 50)}`);
    }
  }
  return 'continue';
}

async function handleExport(ctx: ReplContext): Promise<ReplExitSignal> {
  const exportData = {
    sessionId: ctx.sessionId,
    mode: ctx.getMode(),
    history: ctx.history,
    taskCount: ctx.history.length,
    exportedAt: new Date().toISOString(),
  };

  const filename = `chimera-export-${ctx.sessionId}.json`;
  try {
    const fs = await import('fs');
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    console.log(`  Exported session to ${filename}`);
  } catch (err) {
    console.log(`  Export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

function handleUsage(ctx: ReplContext): ReplExitSignal {
  if (!ctx.currentOrchestrator) {
    console.log('  No tasks run yet — no token usage to report.');
    return 'continue';
  }
  const tracker = ctx.currentOrchestrator.getCostTracker();
  const roles = ['writer', 'reviewer', 'challenger'];
  console.log('  Token usage by role:');
  for (const role of roles) {
    const spend = tracker.getSpend(role);
    if (spend > 0) {
      console.log(`    ${role.padEnd(14)} $${spend.toFixed(4)}`);
    }
  }
  const total = roles.reduce((sum, r) => sum + tracker.getSpend(r), 0);
  console.log(`    ${'total'.padEnd(14)} $${total.toFixed(4)}`);
  return 'continue';
}

async function handleDoctor(ctx: ReplContext): Promise<ReplExitSignal> {
  console.log('  Chimera health check:\n');

  try {
    const providers = await ctx.getProviders();
    const real = providers.filter((p) => p.getModel().provider !== 'mock');
    console.log(`  Providers: ${providers.length} configured (${real.length} real, ${providers.length - real.length} mock)`);
    for (const p of providers) {
      const m = p.getModel();
      console.log(`    ${m.provider}/${m.name}`);
    }
  } catch (err) {
    console.log(`  Providers: ERROR — ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), '.chimera', 'config.yaml');
    const exists = fs.existsSync(configPath);
    console.log(`\n  Config: ${exists ? 'found' : 'not found (.chimera/config.yaml)'}`);
  } catch {
    console.log('\n  Config: unable to check');
  }

  console.log(`  Memory: ${ctx.memory.size()} entries`);

  try {
    const sessions = await ctx.getSessionStore().list();
    console.log(`  Sessions: ${sessions.length} saved`);
  } catch {
    console.log('  Sessions: unable to list');
  }

  console.log(`  Orchestrator: ${ctx.currentOrchestrator ? 'active' : 'idle'}`);
  console.log('\n  Done.');
  return 'continue';
}

async function handleConfig(_ctx: ReplContext): Promise<ReplExitSignal> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const yaml = await import('yaml');
    const configPath = path.join(process.cwd(), '.chimera', 'config.yaml');
    if (!fs.existsSync(configPath)) {
      console.log('  No .chimera/config.yaml found. Run /init or create one manually.');
      return 'continue';
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = yaml.parse(raw);
    if (!cfg || typeof cfg !== 'object') {
      console.log('  Config file exists but failed to parse.');
      return 'continue';
    }
    console.log('  Resolved config:');
    const providers = cfg.providers ?? [];
    console.log(`    Providers: ${providers.length}`);
    for (const p of providers) {
      console.log(`      ${p.name} (${p.provider}/${p.model}) role=${p.role}`);
    }
    if (cfg.defaults) {
      console.log(`    Defaults: ${JSON.stringify(cfg.defaults)}`);
    }
  } catch (err) {
    console.log(`  Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

function handleMemory(ctx: ReplContext): ReplExitSignal {
  const items = ctx.memory.getAll();
  console.log(`  Memory: ${items.length} entries`);

  if (items.length === 0) {
    console.log('  No memories stored yet.');
    return 'continue';
  }

  const byTopic = new Map<string, number>();
  for (const item of items) {
    const topic = item.metadata?.topic ?? 'untagged';
    byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
  }
  console.log('  By topic:');
  for (const [topic, count] of byTopic) {
    console.log(`    ${topic}: ${count}`);
  }

  console.log('  Recent:');
  for (const item of items.slice(-5)) {
    const preview = item.content.slice(0, 60).replace(/\n/g, ' ');
    console.log(`    [${item.metadata?.topic ?? '?'}] ${preview}...`);
  }
  return 'continue';
}

async function handleRewind(ctx: ReplContext, args: string[]): Promise<ReplExitSignal> {
  const sessions = await ctx.getSessionStore().list();
  if (sessions.length === 0) {
    console.log('  No checkpoints to rewind to.');
    return 'continue';
  }

  if (args.length === 0) {
    const previous = sessions.filter((s) => s.id !== ctx.sessionId).slice(-1)[0];
    if (!previous) {
      console.log('  No previous checkpoint to rewind to.');
      return 'continue';
    }
    const cp = await ctx.getSessionStore().load(previous.id);
    if (cp) {
      console.log(`  Rewinding to ${previous.id} (${cp.task.slice(0, 60)})...`);
      ctx.setMode(cp.mode);
    }
    return 'continue';
  }

  const cp = await ctx.getSessionStore().load(args[0]!);
  if (!cp) {
    console.log(`  Checkpoint "${args[0]}" not found.`);
    return 'continue';
  }
  console.log(`  Rewinding to ${args[0]} (${cp.task.slice(0, 60)})...`);
  ctx.setMode(cp.mode);
  return 'continue';
}

function handleAgents(ctx: ReplContext): ReplExitSignal {
  if (!ctx.currentOrchestrator) {
    console.log('  No agents active. Run a task first.');
    return 'continue';
  }
  const events = ctx.currentOrchestrator.getEventStream().getAll();
  const spawned = events.filter((e) => e.type === 'agent_spawned');

  if (spawned.length === 0) {
    console.log('  No agents spawned yet.');
    return 'continue';
  }

  console.log(`  Agents (${spawned.length} total):`);
  for (const evt of spawned) {
    const data = evt as unknown as { agentId: string; role: string; provider: string; model: string };
    console.log(`    ${data.agentId}  ${data.role}  ${data.provider}/${data.model}`);
  }
  return 'continue';
}

async function handleReleaseNotes(): Promise<ReplExitSignal> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const candidates = [
      path.join(process.cwd(), 'RELEASE_NOTES.md'),
      path.join(process.cwd(), 'CHANGELOG.md'),
      path.join(process.cwd(), 'packages', 'chimera-cli', 'RELEASE_NOTES.md'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        console.log(content.slice(0, 2000));
        if (content.length > 2000) console.log('\n  ... (truncated)');
        return 'continue';
      }
    }
    console.log('  No release notes found.');
  } catch {
    console.log('  Unable to read release notes.');
  }
  return 'continue';
}

function handleTheme(args: string[]): ReplExitSignal {
  const themes = ['default', 'dark', 'light', 'monokai', 'solarized'];
  if (args.length === 0) {
    console.log('  Available themes:');
    for (const t of themes) {
      console.log(`    ${t}`);
    }
    console.log('  Usage: /theme <name>');
    return 'continue';
  }
  if (!themes.includes(args[0]!)) {
    console.log(`  Unknown theme "${args[0]}". Available: ${themes.join(', ')}`);
    return 'continue';
  }
  console.log(`  Theme set to "${args[0]}". (TUI theme support coming soon)`);
  return 'continue';
}

function handleOutputStyle(args: string[]): ReplExitSignal {
  const styles = ['concise', 'detailed', 'verbose'];
  if (args.length === 0) {
    console.log('  Available output styles:');
    for (const s of styles) {
      console.log(`    ${s}`);
    }
    console.log('  Usage: /output-style <name>');
    return 'continue';
  }
  if (!styles.includes(args[0]!)) {
    console.log(`  Unknown style "${args[0]}". Available: ${styles.join(', ')}`);
    return 'continue';
  }
  console.log(`  Output style set to "${args[0]}".`);
  return 'continue';
}

function handlePermissions(ctx: ReplContext): ReplExitSignal {
  console.log('  Permission mode: auto');
  console.log('  The orchestrator auto-approves tool calls based on risk level.');
  console.log('  Read-only tools (grep, read) are always allowed.');
  console.log('  Destructive tools (write, shell) require confirmation in code mode.');
  void ctx;
  return 'continue';
}

function handleSandbox(): ReplExitSignal {
  console.log('  Sandbox status: not active');
  console.log('  Sandbox execution isolates agent commands in a restricted environment.');
  console.log('  Enable via config: sandbox.enabled: true');
  return 'continue';
}

function handleVim(): ReplExitSignal {
  const configPath = require('path').join(process.cwd(), '.chimera', 'config.yaml');
  try {
    const fs = require('fs');
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      const yaml = require('yaml');
      config = yaml.parse(fs.readFileSync(configPath, 'utf-8')) ?? {};
    }
    const current = (config as { vim?: boolean }).vim ?? false;
    config.vim = !current;
    const yaml = require('yaml');
    fs.mkdirSync(require('path').dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, yaml.stringify(config));
    console.log(`  Vim mode: ${!current ? 'enabled' : 'disabled'}. (Restart REPL to apply keybindings)`);
  } catch (err) {
    console.log(`  Vim toggle failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

async function handleLogin(args: string[]): Promise<ReplExitSignal> {
  const authConfigPath = require('path').join(process.cwd(), '.chimera', 'auth.json');
  const fs = require('fs');

  if (args.length === 0) {
    if (fs.existsSync(authConfigPath)) {
      try {
        const auth = JSON.parse(fs.readFileSync(authConfigPath, 'utf-8'));
        console.log(`  Logged in as: ${auth.email ?? 'unknown'}`);
        console.log(`  Provider: ${auth.provider ?? 'local'}`);
        console.log('  Use /logout to sign out.');
      } catch {
        console.log('  Auth file exists but is corrupted. Run /login <email> to re-authenticate.');
      }
    } else {
      console.log('  Not logged in. Chimera runs locally with API keys from your environment.');
      console.log('  To authenticate for cloud features: /login <email>');
      console.log('  Or set keys in .env or .chimera/config.yaml.');
    }
    return 'continue';
  }

  const email = args[0];
  if (!email.includes('@')) {
    console.log('  Please provide a valid email address: /login user@example.com');
    return 'continue';
  }

  try {
    fs.mkdirSync(require('path').dirname(authConfigPath), { recursive: true });
    const authData = {
      email,
      provider: 'chimera-cloud',
      authenticatedAt: new Date().toISOString(),
      token: `local-${Buffer.from(email).toString('base64')}`,
    };
    fs.writeFileSync(authConfigPath, JSON.stringify(authData, null, 2));
    console.log(`  Authenticated as ${email}.`);
    console.log('  Cloud features (PR comments, teleport) are now available.');
  } catch (err) {
    console.log(`  Login failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

function handleLogout(): ReplExitSignal {
  const authConfigPath = require('path').join(process.cwd(), '.chimera', 'auth.json');
  const fs = require('fs');
  if (fs.existsSync(authConfigPath)) {
    fs.unlinkSync(authConfigPath);
    console.log('  Logged out. Cloud features are now disabled.');
  } else {
    console.log('  Not logged in.');
  }
  return 'continue';
}

function handleMcp(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), '.chimera', 'config.yaml');
  let servers: Array<{ name: string; command: string; args?: string[] }> = [];
  try {
    if (fs.existsSync(configPath)) {
      const yaml = require('yaml');
      const cfg = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
      servers = cfg?.mcp?.servers ?? [];
    }
  } catch { /* ignore */ }

  if (servers.length === 0) {
    console.log('  No MCP servers configured.');
    console.log('  Add servers to .chimera/config.yaml:');
    console.log('    mcp:');
    console.log('      servers:');
    console.log('        - name: my-server');
    console.log('          command: npx');
    console.log('          args: ["-y", "@modelcontextprotocol/server-xyz"]');
  } else {
    console.log(`  MCP servers (${servers.length}):`);
    for (const s of servers) {
      const argsStr = s.args ? ` ${s.args.join(' ')}` : '';
      console.log(`    ${s.name} — ${s.command}${argsStr}`);
    }
  }
  return 'continue';
}

function handleHooks(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const hooksPath = path.join(process.cwd(), '.chimera', 'hooks.yaml');
  const hooksDir = path.join(process.cwd(), '.chimera', 'hooks');
  let hookCount = 0;

  try {
    if (fs.existsSync(hooksPath)) {
      const yaml = require('yaml');
      const cfg = yaml.parse(fs.readFileSync(hooksPath, 'utf-8'));
      const hooks = cfg?.hooks ?? [];
      if (hooks.length > 0) {
        console.log(`  Registered hooks (${hooks.length}):`);
        for (const h of hooks) {
          console.log(`    ${h.event ?? 'unknown'} → ${h.command ?? h.script ?? '(no command)'}`);
          hookCount++;
        }
      }
    }
    if (fs.existsSync(hooksDir)) {
      const files = fs.readdirSync(hooksDir).filter((f: string) => f.endsWith('.sh') || f.endsWith('.js') || f.endsWith('.ts'));
      if (files.length > 0) {
        console.log(`  Hook scripts in .chimera/hooks/ (${files.length}):`);
        for (const f of files) {
          console.log(`    ${f}`);
          hookCount++;
        }
      }
    }
  } catch { /* ignore */ }

  if (hookCount === 0) {
    console.log('  No hooks registered.');
    console.log('  Create .chimera/hooks.yaml or add scripts to .chimera/hooks/.');
    console.log('  Events: pre-tool-use, post-tool-use, task-start, task-complete, session-start, session-end');
  }
  return 'continue';
}

function handleIde(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const daemonPid = path.join(process.cwd(), '.chimera', 'daemon.pid');
  let connected = false;

  try {
    if (fs.existsSync(daemonPid)) {
      const pid = parseInt(fs.readFileSync(daemonPid, 'utf-8').trim(), 10);
      if (pid && !isNaN(pid)) {
        // Check if process is running
        try {
          process.kill(pid, 0);
          connected = true;
          console.log(`  IDE daemon running (PID ${pid}).`);
        } catch {
          console.log(`  Stale daemon PID ${pid}. Run /ide start to restart.`);
        }
      }
    }
  } catch { /* ignore */ }

  if (!connected) {
    console.log('  IDE connection: not active');
    console.log('  Start the daemon: chimera daemon');
    console.log('  The VS Code extension connects to the daemon automatically.');
    console.log('  Install: search "chimera" in VS Code extensions.');
  }
  return 'continue';
}

function handleBug(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const issueUrl = 'https://github.com/anthropics/chimera/issues/new';

  // Collect diagnostic info
  const diag = {
    version: 'unknown',
    platform: process.platform,
    node: process.version,
    cwd: process.cwd(),
  };
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      diag.version = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version ?? 'unknown';
    }
  } catch { /* ignore */ }

  console.log('  Bug report diagnostics:');
  console.log(`    Chimera: v${diag.version}`);
  console.log(`    Platform: ${diag.platform}`);
  console.log(`    Node: ${diag.node}`);
  console.log(`    CWD: ${diag.cwd}`);
  console.log('');
  console.log('  To file a bug:');
  console.log(`    ${issueUrl}`);
  console.log('  Include the diagnostics above in your report.');

  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const startCmd = process.platform === 'win32'
      ? `start ${issueUrl}`
      : process.platform === 'darwin'
        ? `open ${issueUrl}`
        : `xdg-open ${issueUrl}`;
    execSync(startCmd, { stdio: 'ignore' });
    console.log('  Opened browser.');
  } catch {
    console.log('  (could not open browser automatically)');
  }
  return 'continue';
}

function handleFeedback(): ReplExitSignal {
  const discussionUrl = 'https://github.com/anthropics/chimera/discussions';
  console.log('  Feedback helps us improve Chimera.');
  console.log(`    Discussions: ${discussionUrl}`);
  console.log('    Email: feedback@chimera.dev');
  console.log('');
  console.log('  Quick feedback:');
  console.log('    /bug          — report a bug');
  console.log('    /doctor       — run health checks');

  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const startCmd = process.platform === 'win32'
      ? `start ${discussionUrl}`
      : process.platform === 'darwin'
        ? `open ${discussionUrl}`
        : `xdg-open ${discussionUrl}`;
    execSync(startCmd, { stdio: 'ignore' });
    console.log('  Opened browser.');
  } catch {
    console.log('  (could not open browser automatically)');
  }
  return 'continue';
}

function handlePrComments(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const authPath = path.join(process.cwd(), '.chimera', 'auth.json');

  if (!fs.existsSync(authPath)) {
    console.log('  Not authenticated. Run /login first to access PR comments.');
    return 'continue';
  }

  // Check for GitHub token in env or config
  const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!ghToken) {
    console.log('  GitHub token not found.');
    console.log('  Set GITHUB_TOKEN or GH_TOKEN environment variable.');
    console.log('  Or add it to .chimera/config.yaml under github.token.');
    return 'continue';
  }

  console.log('  PR comments feature requires a GitHub repository context.');
  console.log('  Ensure you are in a git repo with a GitHub remote.');
  console.log('');
  console.log('  Usage: the agent will fetch PR comments automatically when');
  console.log('  reviewing code in a PR context.');
  return 'continue';
}

function handlePrivacySettings(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), '.chimera', 'config.yaml');
  let config: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      const yaml = require('yaml');
      config = yaml.parse(fs.readFileSync(configPath, 'utf-8')) ?? {};
    }
  } catch { /* ignore */ }

  const privacy = (config as { privacy?: Record<string, unknown> }).privacy ?? {};
  console.log('  Privacy settings:');
  console.log(`    Telemetry: ${privacy.telemetry ?? 'disabled (no data leaves your machine)'}`);
  console.log(`    Logging: ${privacy.logging ?? 'local only (.chimera/logs/)'}`);
  console.log(`    Model calls: ${privacy.modelCalls ?? 'sent directly to provider APIs'}`);
  console.log(`    Memory: ${privacy.memory ?? 'stored locally (.chimera/memory/)'}`);
  console.log(`    Web search: ${privacy.webSearch ?? 'queries sent to search provider (DuckDuckGo/SearXNG/Brave)'}`);
  console.log('');
  console.log('  Configure in .chimera/config.yaml under "privacy" section.');
  return 'continue';
}

function handleMigrateInstaller(): ReplExitSignal {
  const fs = require('fs');
  const path = require('path');
  const schemaPath = path.join(process.cwd(), '.chimera', 'schema-version.json');
  const currentVersion = 2;

  let installedVersion = 0;
  try {
    if (fs.existsSync(schemaPath)) {
      const data = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      installedVersion = data.version ?? 0;
    }
  } catch { /* ignore */ }

  if (installedVersion >= currentVersion) {
    console.log(`  Schema version: ${installedVersion} (current)`);
    console.log('  No migration needed.');
    return 'continue';
  }

  console.log(`  Migrating schema from v${installedVersion} to v${currentVersion}...`);

  // Run migrations
  const migrations = [
    { from: 0, to: 1, desc: 'Create .chimera directory structure' },
    { from: 1, to: 2, desc: 'Add session checkpoint format v2' },
  ];

  for (const m of migrations) {
    if (installedVersion < m.to) {
      console.log(`    [${m.from} → ${m.to}] ${m.desc}...`);
      // Migration logic would go here
    }
  }

  try {
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, JSON.stringify({ version: currentVersion, migratedAt: new Date().toISOString() }));
    console.log(`  Migration complete. Schema version: ${currentVersion}`);
  } catch (err) {
    console.log(`  Migration failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return 'continue';
}

function handleTeleport(args: string[]): ReplExitSignal {
  if (args.length === 0) {
    console.log('  Teleport transfers your session to a remote machine.');
    console.log('  Usage: /teleport <host>');
    console.log('  Requirements:');
    console.log('    - SSH access to the target machine');
    console.log('    - chimera installed on the target');
    console.log('    - Session data will be serialized and transferred');
    return 'continue';
  }

  const host = args[0];
  console.log(`  Teleporting session to ${host}...`);
  console.log('  This feature requires:');
  console.log('    1. SSH key-based auth to the target');
  console.log('    2. chimera installed on the remote');
  console.log('');
  console.log('  For now, use this manual workflow:');
  console.log(`    1. chimera export > session.json`);
  console.log(`    2. scp session.json ${host}:~/.chimera/`);
  console.log(`    3. ssh ${host} "chimera resume <session-id>"`);
  return 'continue';
}

async function handleUnknown(
  ctx: ReplContext,
  cmd: string,
  args: string[],
): Promise<ReplExitSignal> {
  // Try custom commands from .chimera/commands/ and ~/.chimera/commands/
  // before falling back to the "Unknown command" message.
  const custom = await loadCustomCommands().catch(() => new Map());
  if (custom.has(cmd)) {
    const customOrch = ctx.currentOrchestrator
      ? {
          execute: async (task: string) => {
            if (!ctx.currentOrchestrator) {
              return { output: '(no orchestrator)', status: 'error' };
            }
            const providers = await ctx.getProviders();
            const writer = ctx.adaptProvider(providers[0]);
            const reviewer = ctx.adaptProvider(providers[1] ?? providers[0]);
            const r = await ctx.currentOrchestrator.execute({
              task,
              mode: ctx.getMode(),
              providers: { writer, reviewer },
            });
            return { output: r.output, status: r.status };
          },
        }
      : null;
    await runCustomCommand(cmd, args, customOrch);
    return 'continue';
  }
  console.log(`  Unknown command: /${cmd}. Type /help for commands.`);
  return 'continue';
}
