import { Command } from 'commander';
import * as readline from 'readline';
import { resolve } from 'path';
import { SessionOrchestrator, EventStream, LongTermMemory, MemoryPersistence, runWorkflow, SchedulerManager, createRuntimeMemory, withAbort } from '@chimera/core';
import type { OrchestratorResult, ToolExecutorInterface, ToolRegistryInterface, WorkflowDefinition } from '@chimera/core';
import type { Mode, DeliberationMode } from '@chimera/core';
import { getBuiltInPreset } from '@chimera/core';
import { ProviderFactory, RateLimitError, ProviderUnavailableError, ProviderError, RateLimiter, SimpleModelRegistry } from '@chimera/providers';
import type { ModelProvider, ModelEntry } from '@chimera/providers';
import { CheckpointStore } from '@chimera/session';
import { LearningEngine } from '@chimera/learning';
import { UserSkillModel, tierMessage, suggestNextValue, resolveActiveStyle } from '@chimera/learning';
import type { ObservedCapability } from '@chimera/learning';
import type { TieredMessage, SkillTier } from '@chimera/learning';
import { getDiagnosticsForFile, setAutoApprove, disposeAllLspServices } from '@chimera/tools';
import type { ToolRegistry, ToolExecutor } from '@chimera/tools';
import { createToolContext, buildPermissionEngine } from './tool-context.js';
import { buildHelpProgram } from './help-program.js';
import { runEval, formatEvalMarkdown } from './eval-runner.js';
import { adaptProvider } from './provider-adapter.js';
import { runSlashCommand } from './commands/registry.js';
import type { ReplContext } from './commands/registry.js';
import { findInSources, loadWorkflowRegistry } from './commands/workflow.js';
import { runWorkflowInContext } from './workflow-runtime.js';

import { autoGenerateConfig, configExists, loadConfig, getProvidersByRole, getDefaultPreset, type ResolvedProvider, type ChimeraConfig } from './config-loader.js';

// @chimera/tui depends on Ink, which is ESM with top-level await.
// Loading it synchronously fails under Node ≥ 22 when this CJS module requires it.
// We import it dynamically inside `startTui()` instead.
import type { Message, Agent, CostData, EventLogEntry, TUIHandle, DiffFile } from '@chimera/tui';
import type { ToolActivity } from '@chimera/tui';
import type { AgentRole } from '@chimera/core';
import { createFallbackProvider } from './fallback-provider.js';
import { runSetup } from './commands/setup.js';

/**
 * Format a provider error into a user-actionable message.
 * Instead of "Rate limit exceeded: HTTP 429", the user sees which provider
 * failed, what it means, and what to do about it.
 */
function formatProviderError(err: unknown, providerName?: string): string {
  if (err instanceof RateLimitError) {
    const provider = err.provider ?? providerName ?? 'your provider';
    const retryHint = err.retryAfter
      ? ` Retry after ${err.retryAfter}s.`
      : '';
    return [
      `Rate limit hit on ${provider}.`,
      `This usually means you've exceeded the API's requests-per-minute limit.${retryHint}`,
      `Tips:`,
      `  - Wait a minute and try again`,
      `  - Add more providers to .chimera/config.yaml for automatic failover`,
      `  - Check your API key quota at the provider's dashboard`,
    ].join('\n');
  }
  if (err instanceof ProviderUnavailableError) {
    const provider = err.provider ?? providerName ?? 'your provider';
    return [
      `Provider unavailable: ${provider}.`,
      `The service may be down, the model may be deprecated, or your API key may be invalid.`,
      `Tips:`,
      `  - Run \`chimera setup\` to reconfigure your providers`,
      `  - Check the provider's status page`,
      `  - Verify your API key is correct in .env`,
    ].join('\n');
  }
  if (err instanceof ProviderError) {
    const provider = err.provider ?? providerName ?? 'your provider';
    const status = err.statusCode ? ` (HTTP ${err.statusCode})` : '';
    return [
      `Provider error from ${provider}${status}: ${err.message}`,
      `Tips:`,
      `  - Check your API key and model name in .chimera/config.yaml`,
      `  - Run \`chimera setup\` to reconfigure`,
    ].join('\n');
  }
  return err instanceof Error ? err.message : String(err);
}

/** Render a tiered message for the given skill tier, logging the reason in dev. */
function renderTiered(msg: TieredMessage, tier: SkillTier): string {
  if (process.env.CHIMERA_DEV || process.argv.includes('--verbose')) {
    // dev-only single-line signal trace
    console.error(`[skill] (tierMessage) → ${tier}`);
  }
  return tierMessage(msg, tier);
}

/**
 * Validate that at least one provider can be created successfully.
 * Called on startup to fail fast with a clear message instead of discovering
 * a missing API key mid-task.
 */
function validateStartupProviders(
  mapped: { writer?: ModelProvider; reviewer?: ModelProvider; challenger?: ModelProvider; fallback: ModelProvider[] },
  skillModel?: UserSkillModel,
  log: typeof console.log = console.log,
): void {
  const tier = skillModel?.tier() ?? 'intermediate';
  const real = mapped.fallback.filter((p) => p.getModel().provider !== 'mock');
  if (real.length === 0 && mapped.fallback.length > 0) {
    // Only mock providers — warn but don't block
    const mockMsg: TieredMessage = {
      beginner:
        '  ⚠ No real API keys found — using the offline mock provider.\n  This lets you try the interface, but it won\'t actually call a model.\n  Run `chimera setup` to add a real provider and start getting real answers.',
      intermediate: '  ⚠ No real API keys found — using offline mock provider.',
      advanced: '  ⚠ No real API keys — mock provider active.',
    };
    log(renderTiered(mockMsg, tier));
    log('  Run `chimera setup` to configure real providers.\n');
  }
  if (mapped.fallback.length === 0) {
    const noneMsg: TieredMessage = {
      beginner:
        '\n✗ No providers available. You need at least one provider to run Chimera.\n  - Run `chimera setup` for an interactive walkthrough\n  - Or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY in your .env file',
      intermediate: '\n✗ No providers available. Configure at least one provider:',
      advanced: '\n✗ No providers configured.',
    };
    console.error(renderTiered(noneMsg, tier));
    console.error('  - Run `chimera setup` for interactive configuration');
    console.error('  - Or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY in .env\n');
    process.exit(1);
  }
}

/**
 * Shape of a unified diff carried on a `tool_call_result` event.
 * Structurally compatible with `FileDiff` from `@chimera/tools`, declared
 * locally so the CLI doesn't take a type-only dependency on the tools package.
 */
interface FileDiffLike {
  path: string;
  patch: string;
  unchanged: boolean;
  binary: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
}

/**
 * Fully-wired run context, produced by `buildRunContext()` and consumed by
 * every entry point (one-shot run, REPL, TUI, resume, slash commands).
 * The orchestrator is created with a live `SimpleModelRegistry` plus active
 * `RateLimiter` so the DeliberationEngine path is live.
 */
export interface RunContext {
  orchestrator: SessionOrchestrator;
  writer?: ModelProvider;
  reviewer?: ModelProvider;
  challenger?: ModelProvider;
  registry: import('@chimera/providers').ModelRegistry;
  rateLimiter: RateLimiter;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
}

export class CliRouter {
  private program: Command;
  private verbose = false;
  private noLearn = false;
  private sessionStore!: CheckpointStore;
  private memory!: LongTermMemory;
  private memoryPersistence!: MemoryPersistence;
  private learningEngine!: LearningEngine;
  private _runtimeInitialized = false;

  constructor() {
    this.program = buildHelpProgram((definition, inputs, eventStream) =>
      this.executeWorkflowDefinition(definition, inputs, this.program.opts().mode ?? 'ask', eventStream));
    this.setupCommands();
  }

  private initializeRuntime(): void {
    if (this._runtimeInitialized) {
      return;
    }
    this._runtimeInitialized = true;
    this.sessionStore = new CheckpointStore();
    const workspaceRoot = process.cwd();
    this.memoryPersistence = new MemoryPersistence({ workspaceRoot });
    this.memory = this.memoryPersistence.getMemory();
    this.learningEngine = new LearningEngine({
      sessionDir: resolve(workspaceRoot, '.chimera', 'sessions'),
      outputDir: workspaceRoot,
      autoApply: true,
      minSessionsThreshold: 1,
    });
  }



  /**
   * Build a fully-wired run context: tools, resolved providers, a live
   * `SimpleModelRegistry`, active `RateLimiter`, and a
   * `SessionOrchestrator` that receives all of them. The `mode` parameter
   * carries the requested/effective mode into the permission engine so that
   * read-only modes (ask/plan/review) cannot write even when auto-approve
   * is active.
   */
  private async buildRunContext(
    mode: Mode,
    options?: { yolo?: boolean; interactive?: boolean },
  ): Promise<RunContext> {
    const eventStream = new EventStream();

    if (this.verbose) {
      eventStream.subscribe('*', (event) => {
        console.error(`  [event] ${event.type}`, JSON.stringify(event, null, 2));
      });
    }

    // Wire up tool system with mode-based permission enforcement.
    const { toolRegistry, toolExecutor } = createToolContext(mode, options);

    // Resolve providers (reuse existing resolution — never duplicate it).
    const mapped = await this.getRoleMappedProviders();
    let { writer, reviewer, challenger } = mapped;
    if (!writer && !reviewer && !challenger) {
      // No role mapping (e.g. only env-based mocks); derive from the fallback list.
      writer = mapped.fallback[0];
      reviewer = mapped.fallback[1] ?? mapped.fallback[0];
      challenger = mapped.fallback[2] ?? mapped.fallback[1] ?? mapped.fallback[0];
    }
    const resolved = [writer, reviewer, challenger].filter(Boolean) as ModelProvider[];

    // Build the registry from the resolved providers.
    const registry = new SimpleModelRegistry();
    for (const p of resolved) {
      const info = p.getModel();
      const pricing = p.getPricing();
      const modelEntry: ModelEntry = {
        id: info.id || info.name,
        name: info.name,
        provider: info.provider,
        contextWindow: info.contextWindow,
        maxOutputTokens: info.maxOutputTokens,
        pricing: {
          inputPerMillion: pricing.inputPerMillion,
          outputPerMillion: pricing.outputPerMillion,
          cacheReadPerMillion: pricing.cacheReadPerMillion,
          cacheWritePerMillion: pricing.cacheWritePerMillion,
        },
        capabilities: {
          toolCalling: p.supportsToolCalling(),
          structuredOutput: p.supportsStructuredOutput(),
          vision: p.supportsVision(),
          reasoning: p.supportsReasoning(),
          parallelToolCalls: false,
        },
        degradationThreshold: 0.75,
        tier: info.provider === 'mock' ? 'cheap' : 'frontier',
      };
      try {
        registry.register(modelEntry);
      } catch {
        // A provider with an odd id/partial entry shouldn't break startup;
        // the default hardcoded models already in the registry remain.
      }
    }

    const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

    const orchestrator = new SessionOrchestrator(
      eventStream,
      { registry: toolRegistry as unknown as ToolRegistryInterface, executor: toolExecutor as unknown as ToolExecutorInterface },
      process.cwd(),
      undefined,
      {
        registry,
        rateLimiter,
        ...(writer
          ? await createRuntimeMemory(process.cwd(), this.noLearn || this.program.opts().learn === false ? undefined : adaptProvider(writer), this.memoryPersistence)
          : { memoryPersistence: this.memoryPersistence }),
        lspDiagnostics: (file: string) => getDiagnosticsForFile(process.cwd(), file),
      },
    );

    return {
      orchestrator,
      writer,
      reviewer,
      challenger,
      registry,
      rateLimiter,
      toolRegistry,
      toolExecutor,
    };
  }

  /** Thin backward-compatible accessor. Prefer `buildRunContext()`. */
  private async initOrchestrator(
    mode: Mode,
    options?: { yolo?: boolean; interactive?: boolean },
  ): Promise<SessionOrchestrator> {
    return (await this.buildRunContext(mode, options)).orchestrator;
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
    let config = loadConfig();
    if (!config && !configExists()) {
      // No config file yet — auto-generate from env (incl. the free
      // CHIMERA_CHEAP_API_KEY slot) so the harness runs out-of-the-box on
      // whatever keys are present. This also covers `eval --real`, which
      // calls this method directly without the auto-generate step in run().
      const generated = await autoGenerateConfig();
      if (generated) config = generated;
    }
    if (config) {
      // Allow per-role model overrides via env vars (CHIMERA_WRITER_MODEL, etc.)
      // even when a config file already exists. This lets a stronger model be
      // targeted for the writer without editing the YAML. Falls back to the
      // existing NIM / openai-compatible slot (CHIMERA_CHEAP_API_KEY/base_url).
      this.applyRoleModelOverrides(config);
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
      console.error(
        '\n  ⚠ No API keys configured — using offline MockProvider. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to use a real model.\n',
      );
    }
    return { fallback };
  }

  /**
   * Override the model on each role's provider entry from CHIMERA_*_MODEL env
   * vars. Reuses the role's existing api_key/base_url (so a NIM writer can be
   * swapped to a stronger NIM model without re-specifying credentials).
   */
  private applyRoleModelOverrides(config: ChimeraConfig): void {
    const overrides: Record<string, string | undefined> = {
      writer: process.env.CHIMERA_WRITER_MODEL,
      reviewer: process.env.CHIMERA_REVIEWER_MODEL,
      challenger: process.env.CHIMERA_CHALLENGER_MODEL,
    };
    for (const provider of config.providers) {
      const model = overrides[provider.role];
      if (model && model.trim().length > 0) {
        provider.model = model.trim();
      }
    }
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

  private async run(mode: Mode, task: string, preset: DeliberationMode = getDefaultPreset() ?? 'solo', verificationCommands: string[] = [], commandOptions: Record<string, unknown> = {}): Promise<void> {
    const label: Record<Mode, string> = {
      ask: 'Answering',
      plan: 'Planning',
      code: 'Coding',
      debug: 'Debugging',
      review: 'Reviewing',
      oal: 'Optimizing',
      auto: 'Auto-selecting',
    };

    // Per-invocation skill model (one-shot path has no persistent session).
    const skillModel = new UserSkillModel();
    const opts = { ...this.program.opts(), ...commandOptions };
    const log = opts.json === true ? console.error : console.log;
    const scripted =
      !!process.env.NONINTERACTIVE ||
      process.argv.includes('--yes') ||
      process.argv.includes('-y') ||
      opts.yes === true;
    skillModel.observeCommandUsage({ flags: process.argv.slice(2), usedPreset: !!preset && preset !== 'solo', scripted, configOverridden: false });
    skillModel.observeMessage(task);

    // Resolve the self-built/user output style once in the CLI layer, which
    // owns the `learning` dependency. core must not import `learning`
    // (dependency cycle), so the resolved style is passed down as plain data.
    const workspaceRoot = process.cwd();
    const style = await resolveActiveStyle(workspaceRoot, this.noLearn || opts.learn === false ? undefined : skillModel);

    log(`\n\u2699 Chimera [${mode}] \u2014 ${label[mode]}...\n`);

    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        log(`  \u2713 Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    const mapped = await this.getRoleMappedProviders();

    // #6 — Validate providers on startup (fail fast)
    validateStartupProviders(mapped, skillModel, log);
  
    // #1 — Use FallbackChain when multiple providers are available.
    // Instead of a single writer that dies on the first 429, the fallback
    // chain tries each provider in order before giving up.
    const allProviders = mapped.fallback;
    const writer = allProviders.length > 1
      ? createFallbackProvider(allProviders, (event) => {
          if (event.type === 'fallback') {
            log(`  \u26a0 ${event.from} failed (${event.error.message.slice(0, 60)}), falling back to ${event.to}...`);
          }
        })
      : adaptProvider(allProviders[0]);
    const reviewer = mapped.reviewer
      ? adaptProvider(mapped.reviewer)
      : (allProviders.length > 1 ? createFallbackProvider(allProviders) : adaptProvider(allProviders[0]));
    const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;

    // Resolve preset aliases: map preset name → role→alias mapping
    const presetAliases = this.resolvePresetAliases(preset);

    // #1d/#1e/#3d — Mode-based permission gating.
    // plan/ask/review become read-only (no writes); `code`/`debug` permit edits.
    // `--yolo` opts into full-access for code/debug only (off by default).
    // In an interactive terminal the four write tools flip to 'ask', engaging
    // the pre-write approval gate (diff shown before the write lands).
    // The permission engine is attached to the tool executor via
    // buildRunContext(mode, { yolo, interactive }) — read-only modes cannot
    // write even with yolo.
    const yolo = process.argv.includes('--yolo') || opts.yolo === true;
    const interactive = process.stdin.isTTY === true;
    const ctx = await this.buildRunContext(mode, { yolo, interactive });
    const orchestrator = ctx.orchestrator;
    // Pass backend URL from config to orchestrator for alias resolution
    const config = loadConfig();
    const backendUrl = (config as any)?.backend === 'dmr-x' && config?.providers?.[0]?.base_url
      ? config.providers[0].base_url
      : undefined;
    if (backendUrl) {
      orchestrator.setConfigBackend(backendUrl, config?.providers?.[0]?.api_key);
    }

    // When running headless (--yolo or NONINTERACTIVE=1 / --yes), auto-approve
    // the per-tool 'ask' gate so background/CI builds can actually write to
    // disk instead of stalling on a stdin prompt that will never arrive.
    if (yolo) {
      setAutoApprove(true);
      process.env.NONINTERACTIVE = '1';
    }

    // #4 — Tool execution visibility: stream tool activity to the terminal
    // so the user sees what the agent is doing in real time.
    orchestrator.getEventStream().subscribe('*', (event) => {
      if (event.type === 'tool_call_requested') {
        const call = (event as any).call as { tool?: string; args?: Record<string, unknown> } | undefined;
        const toolName = call?.tool ?? 'unknown';
        const argsPreview = call?.args
          ? ' ' + JSON.stringify(call.args).slice(0, 80)
          : '';
        log(`  \u25b6 [tool] ${toolName}${argsPreview}`);
        // Pre-write approval gate: when a write tool requests approval, the
        // executor has attached a diff of exactly what is about to change —
        // show it BEFORE the interactive prompt (which fires right after this
        // event) so the user can approve against the real patch.
        const policy = (event as any).policy as string | undefined;
        if (policy === 'ask' || policy === 'escalate') {
          this.printDiffs((event as any).diffs as FileDiffLike[] | undefined, log);
        }
      } else if (event.type === 'tool_call_result') {
        const result = (event as any).result as
          | { tool?: string; exitCode?: number; diffs?: FileDiffLike[] }
          | undefined;
        const status = result?.exitCode !== undefined && result.exitCode !== 0
          ? `\u2717 exit ${result.exitCode}`
          : '\u2713 ok';
        log(`  \u25c0 [tool] ${result?.tool ?? 'unknown'} ${status}`);
        this.printDiffs(result?.diffs, log);
      } else if (
        (event as any).type === 'tool_call_failed' ||
        (event as any).type === 'tool_call_retry' ||
        (event as any).type === 'tool_call_repaired' ||
        (event as any).type === 'prose_fallback_landed'
      ) {
        // Loop-safety observability: these events mean the tool layer had to
        // heal or reject a call — without them a silent needs_user is undebuggable.
        const e = event as any;
        log(`  \u26a0 [${e.type}] ${e.tool ?? e.path ?? ''} ${String(e.error ?? e.files ?? '').slice(0, 140)}`);
      } else if ((event as any).type === 'compaction_triggered') {
        const e = event as any;
        log(`  \u2a5d [compaction] freed ~${e.tokensSaved ?? '?'} tokens`);
      }
    });
  
    try {
      const result = await orchestrator.execute({
        task,
        mode,
        preset,
        presetAliases: presetAliases ?? undefined,
        providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
        skillModel,
        style,
        verificationCommands,
        verificationOutputs: opts.verifyOutput as string[] | undefined,
        verificationInputs: opts.verifyInput as string[] | undefined,
      });

      skillModel.observeTaskOutcome({ clean: result.status === 'done' });
      if (opts.json === true) {
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        this.printResult(result, skillModel);
      }
      if (result.status !== 'done') process.exitCode = 1;
    } catch (err) {
      // #3 — Better error messages for provider failures
      const msg = formatProviderError(err);
      console.error(`\n\u2717 Error:\n${msg}\n`);
      process.exitCode = 1;
    } finally {
      // One-shot CLI run: release the orchestrator's periodic timers so the
      // process can exit as soon as the result has been printed.
      orchestrator.dispose();
    }
  }

  /**
   * Resolve a preset name to a role→alias mapping.
   * Reads from YAML config presets, falling back to built-in presets.
   */
  private resolvePresetAliases(preset: DeliberationMode): Record<string, string> | undefined {
    // Read custom presets from YAML config
    const config = loadConfig();
    const customPresets = (config as any)?.presets as Array<{ id: string; roles: Record<string, string> }> | undefined;
    if (customPresets?.length) {
      const found = customPresets.find(p => p.id === preset);
      if (found) return found.roles;
    }

    // Fall back to built-in presets
    const builtIn = getBuiltInPreset(preset);
    if (builtIn) return builtIn.roles;

    return undefined;
  }

  /**
   * Show what a file-mutating tool actually changed.
   *
   * Always prints the per-file +/- summary so a write is never silent; the
   * full patch body is reserved for --verbose to keep normal runs readable.
   */
  private printDiffs(diffs?: FileDiffLike[], log: typeof console.log = console.log): void {
    if (!diffs?.length) return;

    for (const d of diffs) {
      if (d.unchanged) {
        log(`     ~ ${d.path} (no change)`);
        continue;
      }
      if (d.binary) {
        log(`     ~ ${d.path} (binary, diff not shown)`);
        continue;
      }
      const truncNote = d.truncated ? ' [diff truncated]' : '';
      log(`     ~ ${d.path}  +${d.additions}/-${d.deletions}${truncNote}`);

      if (this.verbose && d.patch) {
        for (const line of d.patch.split('\n')) {
          if (line.length === 0) continue;
          // Colorize +/- so the change reads at a glance; leave headers plain.
          const color =
            line.startsWith('+') && !line.startsWith('+++') ? '[32m'
            : line.startsWith('-') && !line.startsWith('---') ? '[31m'
            : '';
          log(color ? `       ${color}${line}[0m` : `       ${line}`);
        }
      }
    }
  }

  private printResult(result: OrchestratorResult, skillModel?: UserSkillModel): void {
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
      const tier = skillModel?.tier() ?? 'intermediate';
      const emptyMsg: TieredMessage = {
        beginner: '\n⚠ Empty response. The model returned no content.',
        intermediate: '\n⚠ Empty response. The model returned no content.',
        // Advanced users already know the usual culprits — skip the API-key primer.
        advanced: '\n⚠ Empty response.',
      };
      console.log(renderTiered(emptyMsg, tier));
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
    const collectVerification = (value: string, previous: string[] = []) => [...previous, value];
    this.program
      .action(async () => {
        this.initializeRuntime();
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
      .option('--preset <mode>', 'deliberation preset (solo|duo|trio|fusion|hive|swarm|auto)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        if (options.tui) {
          await this.startTui(task, 'ask');
        } else {
          await this.run('ask', task, options.preset, [], options);
        }
      });

    this.program
      .command('plan <task>')
      .description('Create a plan')
      .option('--preset <mode>', 'deliberation preset (solo|duo|trio|fusion|hive|swarm|auto)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('plan', task, options.preset, [], options);
      });

    this.program
      .command('code <task>')
      .description('Write code')
      .option('--verify <command>', 'caller-owned verification command (repeatable)', collectVerification, [])
      .option('--verify-output <path>', 'allow newly generated files under this caller-declared output path (repeatable)', collectVerification, [])
      .option('--verify-input <path>', 'protect this existing caller-owned verifier file across generation and repair (repeatable)', collectVerification, [])
      .option('--preset <mode>', 'deliberation preset (solo|duo|trio|fusion|hive|swarm|auto)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('code', task, options.preset, options.verify, options);
      });

    this.program
      .command('debug <task>')
      .description('Debug an issue')
      .option('--verify <command>', 'caller-owned verification command (repeatable)', collectVerification, [])
      .option('--verify-output <path>', 'allow newly generated files under this caller-declared output path (repeatable)', collectVerification, [])
      .option('--verify-input <path>', 'protect this existing caller-owned verifier file across generation and repair (repeatable)', collectVerification, [])
      .option('--preset <mode>', 'deliberation preset (solo|duo|trio|fusion|hive|swarm|auto)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('debug', task, options.preset, options.verify, options);
      });

    this.program
      .command('review <task>')
      .description('Review code')
      .option('--preset <mode>', 'deliberation preset (solo|duo|trio|fusion|hive|swarm|auto)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('review', task, options.preset, [], options);
      });

    this.program
      .command('oal <task>')
      .description('Run an autonomous optimization loop (bounded budget, serial quality gate)')
      .option('--verify <command>', 'caller-owned verification command (repeatable)', collectVerification, [])
      .option('--verify-output <path>', 'allow newly generated files under this caller-declared output path (repeatable)', collectVerification, [])
      .option('--verify-input <path>', 'protect this existing caller-owned verifier file across generation and repair (repeatable)', collectVerification, [])
      .option('--preset <mode>', 'deliberation preset (solo)', 'solo')
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'auto-approve all tool calls (off by default; for CI/trusted automation)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.run('oal', task, options.preset, options.verify, options);
      });

    this.program
      .command('parallel <task>')
      .description('Execute a coding task with coordinated sub-agents and caller verification')
      .option('--verify <command>', 'caller-owned verification command (repeatable)', collectVerification, [])
      .option('--verify-output <path>', 'allow newly generated files under this caller-declared output path (repeatable)', collectVerification, [])
      .option('--verify-input <path>', 'protect this existing caller-owned verifier file across generation and repair (repeatable)', collectVerification, [])
      .option('--json', 'emit a JSON result instead of human-readable output')
      .option('--yolo', 'explicitly auto-approve tools (off by default)')
      .action(async (task: string, options) => {
        this.verbose = this.program.opts().verbose ?? false;
        await this.runParallel(task, options.verify, options);
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
      .option('--verify <command>', 'verification command (repeatable)', collectVerification, [])
      .action(async (descParts: string[], options: { verify: string[] }) => {
        this.verbose = this.program.opts().verbose ?? false;
        const goal = descParts.join(' ');
        if (!goal) {
          console.error('\n✗ Goal description required.\n');
          process.exit(1);
        }
        await this.runGoal(goal, options.verify);
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
          console.log('  Session already completed; no actions replayed.\n');
          return;
        }

        const orchestrator = await this.initOrchestrator(checkpoint.mode);
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
          // Continue from restored state: feed the prior writer conversation
          // (user/assistant turns only — drop system prompts) as history so
          // execute() builds on it instead of re-planning from turn zero.
          const priorHistory = Array.isArray((checkpoint as any).messages)
            ? (checkpoint as any).messages.filter(
                (m: { role: string }) => m.role === 'user' || m.role === 'assistant',
              )
            : undefined;
          const result = await orchestrator.execute({
            task: checkpoint.task,
            mode: checkpoint.mode,
            providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
            conversationHistory: priorHistory,
            verificationCommands: (checkpoint as any).verificationContract?.commands,
            verificationOutputs: (checkpoint as any).verificationContract?.generatedOutputs,
          }).finally(async () => {
            await this.sessionStore.save(orchestrator.exportState(sessionId, checkpoint.task, checkpoint.mode));
          });
          this.printResult(result);
          if (result.status !== 'done') process.exitCode = 1;
        } catch (err) {
          console.error(`\n✗ Error: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      });

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
            toolOptions: { yolo: this.program.opts().yolo === true, interactive: false },
          });

          if (options.format === 'markdown') {
            console.log(formatEvalMarkdown(report));
          } else {
            console.log(`\n  Eval Report — ${report.runId}`);
            console.log(`  Tasks: ${report.summary.totalTasks} | Pass: ${report.summary.passed} | Fail: ${report.summary.failed}`);
            console.log(`  Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`);
            console.log(`  Avg cost: $${report.summary.avgCost.toFixed(4)}`);
            console.log(`  Avg quality (heuristic unless judged): ${(report.summary.avgQuality * 100).toFixed(1)}%`);
            console.log(`  Cost savings vs frontier: ${report.summary.costSavingsVsFrontier === null ? 'unavailable (no measured baseline)' : `${report.summary.costSavingsVsFrontier}%`}`);
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
      .command('setup')
      .description('Interactive setup for providers, API keys, and roles')
      .action(async () => {
        try {
          await runSetup(process.cwd());
        } catch (err) {
          console.error(`\n\u2717 Setup failed: ${err instanceof Error ? err.message : String(err)}\n`);
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

          const { cleanupStaleWorktrees, removeWorktree } = await import('@chimera/isolation');
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
    // The Ink dashboard needs a real TTY: its selectors (Mode/Preset/Input)
    // call Ink's `useInput`, which unconditionally requests raw mode on
    // stdin. Under a non-interactive stdin (piped/redirected, e.g. spawned
    // by CI or a script without a pty) Ink throws synchronously — "Raw mode
    // is not supported on the current process.stdin" — which surfaces as an
    // uncaught crash inside whichever selector mounts first. Detect that
    // upfront and fall back to the line-based REPL (readline, which doesn't
    // need raw mode) instead of letting Ink crash.
    if (!process.stdin.isTTY) {
      console.error(
        '\n✗ The full-screen TUI needs an interactive terminal (stdin is not a TTY).\n' +
        '  Falling back to the line-based REPL. Pass --repl to select this explicitly,\n' +
        '  or run a task directly for non-interactive use, e.g. `chimera ask "..."`.\n',
      );
      await this.startRepl();
      return;
    }
    // Lazy-load Ink/TUI: it's an ESM module with top-level await and cannot be
    // required() synchronously from this CJS CLI. Dynamic import keeps boot clean.
    const { runTUI } = await import('@chimera/tui');

    // TUI owns its own skill model instance (it feeds its own signals; the
    // per-turn REPL feeding path is a separate launch and need not share this).
    const skillModel = new UserSkillModel();
    const style = await resolveActiveStyle(process.cwd(), this.noLearn || this.program.opts().learn === false ? undefined : skillModel);

    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        console.log(`  ✓ Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    const mapped = await this.getRoleMappedProviders();

    // #6 — Validate providers before launching TUI
    validateStartupProviders(mapped);

    // #1 — Use FallbackChain in TUI mode too
    const allProvidersTui = mapped.fallback;
    const writer = allProvidersTui.length > 1
      ? createFallbackProvider(allProvidersTui, (event) => {
          if (event.type === 'fallback') {
            console.log(`  \u26a0 ${event.from} failed, falling back to ${event.to}...`);
          }
        })
      : adaptProvider(allProvidersTui[0]);
    const reviewer = mapped.reviewer
      ? adaptProvider(mapped.reviewer)
      : (allProvidersTui.length > 1 ? createFallbackProvider(allProvidersTui) : adaptProvider(allProvidersTui[0]));
    const challenger = mapped.challenger ? adaptProvider(mapped.challenger) : undefined;
    const yolo = this.program.opts().yolo === true || process.argv.includes('--yolo');
    const interactive = process.stdin.isTTY === true;
    const ctx = await this.buildRunContext(initialMode, { yolo, interactive });
    const orchestrator = ctx.orchestrator;
    // Pass backend URL from config to orchestrator for alias resolution
    const tuiConfig = loadConfig();
    const tuiBackendUrl = (tuiConfig as any)?.backend === 'dmr-x' && tuiConfig?.providers?.[0]?.base_url
      ? tuiConfig.providers[0].base_url
      : undefined;
    if (tuiBackendUrl) {
      orchestrator.setConfigBackend(tuiBackendUrl, tuiConfig?.providers?.[0]?.api_key);
    }
    let sessionId = this.sessionStore.generateSessionId();

    let currentMessages: Message[] = [];
    let currentAgents: Agent[] = [];
    let currentCostData: CostData = { currentCost: 0, budget: 10, breakdown: [] };
    let currentEvents: EventLogEntry[] = [];
    let currentMode: Mode = initialMode;
    let currentPreset: DeliberationMode = getDefaultPreset() ?? 'solo';
    let activeTool: ToolActivity | undefined;
    let currentDiffFiles: DiffFile[] = [];
    const conversationHistory: Array<{ role: string; content: string }> = [];

    /** Derive aggregate token usage from the live agent list. */
    const computeTokenUsage = (): { input: number; output: number; total: number } => {
      const input = currentAgents.reduce((s, a) => s + a.tokenUsage.input, 0);
      const output = currentAgents.reduce((s, a) => s + a.tokenUsage.output, 0);
      return { input, output, total: input + output };
    };

    /**
     * Collect proposed changes for the DiffViewer. Reads `git diff` for the
     * paths referenced by a `patch_proposed` event (falls back to the full
     * working tree when no files are named). Safe: never throws — a missing
     * repo or git failure simply yields an empty list.
     */
    const collectDiffFiles = (files?: string[]): DiffFile[] => {
      try {
        const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
        const raw = execFileSync('git', ['diff', '--no-color', ...(files && files.length > 0 ? files : ['.'])], { cwd: workspaceRoot, encoding: 'utf8' });
        if (!raw.trim()) return [];
        return parseGitDiff(raw);
      } catch {
        return [];
      }
    };

    /** Parse `git diff` output into structured DiffFile hunks. */
    const parseGitDiff = (raw: string): DiffFile[] => {
      const files: DiffFile[] = [];
      const fileChunks = raw.split(/^(?=diff --git )/m);
      for (const chunk of fileChunks) {
        const header = chunk.match(/^diff --git a\/(.+?) b\/(.+?)\n/);
        if (!header) continue;
        const path = header[2];
        const hunks: DiffFile['hunks'] = [];
        let additions = 0;
        let deletions = 0;
        const lines = chunk.split('\n');
        let cur: DiffFile['hunks'][number] | null = null;
        let oldLine = 0;
        let newLine = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const hunkHeader = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (hunkHeader) {
            if (cur) hunks.push(cur);
            oldLine = Number(hunkHeader[1]);
            newLine = Number(hunkHeader[2]);
            cur = { oldStart: oldLine, oldLines: 0, newStart: newLine, newLines: 0, lines: [] };
            continue;
          }
          if (!cur) continue;
          if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
            cur.newLines++;
            cur.lines.push({ type: 'addition', content: line.slice(1), newLineNum: newLine++ });
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
            cur.oldLines++;
            cur.lines.push({ type: 'deletion', content: line.slice(1), oldLineNum: oldLine++ });
          } else if (line.startsWith(' ') || line.startsWith('\\')) {
            cur.oldLines++;
            cur.newLines++;
            cur.lines.push({ type: 'context', content: line.slice(1), oldLineNum: oldLine++, newLineNum: newLine++ });
          }
        }
        if (cur) hunks.push(cur);
        if (hunks.length > 0) files.push({ path, additions, deletions, hunks });
      }
      return files;
    };

    // The tracker exposes spend only; never infer tokens from spend or progress.
    const buildLiveCostData = (): CostData => ({
      currentCost: orchestrator.getCostTracker().getTotalCost(),
      budget: 10,
      breakdown: Object.entries(orchestrator.getCostTracker().getSpendByProvider()).map(([role, cost]) => ({
        provider: role,
        model: '',
        inputTokens: 0,
        outputTokens: 0,
        cost,
      })),
    });

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
    const providers = { writer, reviewer, ...(challenger ? { challenger } : {}) };
    let tui!: TUIHandle;
    let activeController: AbortController | undefined;
    let activeOperation: Promise<unknown> | undefined;
    let restoringSession = false;
    let exiting = false;
    let unsubscribe = () => {};
    let shutdownPromise: Promise<void> | undefined;
    let loopState: ReturnType<ReplContext['getLoopState']> = null;

    const shutdown = (): Promise<void> => shutdownPromise ??= (async () => {
      exiting = true;
      activeController?.abort(new Error('TUI closed'));
      unsubscribe();
      try {
        await activeOperation?.catch(() => {});
      } finally {
        orchestrator.dispose();
        tui?.cleanup();
        await disposeAllLspServices();
      }
    })();

    const notice = (content: string) => {
      currentMessages = [...currentMessages, {
        id: Math.random().toString(36).slice(2), role: 'system', content, timestamp: Date.now(),
      }];
      if (!exiting) tui.update({ messages: currentMessages, mode: currentMode, preset: currentPreset });
    };

    const runOperation = <T,>(operation: (mode: Mode, preset: DeliberationMode, signal: AbortSignal) => Promise<T>): Promise<T> => {
      if (activeController || restoringSession || exiting) return Promise.reject(new Error('Another operation is active or the TUI is closing.'));
      const mode = currentMode;
      const preset = currentPreset;
      const controller = new AbortController();
      // An optional host-owned signal is composed, never replaced or aborted.
      const contextSignal = (ctx as RunContext & { signal?: AbortSignal }).signal;
      const signal = AbortSignal.any([controller.signal, ...(contextSignal ? [contextSignal] : [])]);
      activeController = controller;
      ctx.toolExecutor.setPermissionEngine(buildPermissionEngine(mode, yolo, interactive));
      tui.update({ isRunning: true });
      activeOperation = (async () => {
        try {
          signal.throwIfAborted();
          return await operation(mode, preset, signal);
        } finally {
          controller.abort('operation-finished');
          try {
            currentCostData = buildLiveCostData();
            if (!exiting) tui.update({ costData: currentCostData, sessions: await loadSessions() });
          } finally {
            activeController = undefined;
            activeOperation = undefined;
            activeTool = undefined;
            if (!exiting) tui.update({ isRunning: false, activeTool: undefined });
          }
        }
      })();
      return activeOperation as Promise<T>;
    };

    const executeTask = async (task: string, mode: Mode, preset: DeliberationMode, signal: AbortSignal, verificationCommands?: string[], costCap = 10, goal = false) => {
      const result = goal ? await this.executeGoal(task, verificationCommands, { context: ctx, signal, mode, preset }) : await orchestrator.execute({
        task, mode, providers, preset, signal, costCap, verificationCommands,
        presetAliases: this.resolvePresetAliases(preset) ?? undefined,
        conversationHistory, skillModel, style,
      });
      const content = `${result.status === 'done' ? '' : `Status: ${result.status}\n`}${result.output || 'The model returned no response.'}`;
      const last = currentMessages[currentMessages.length - 1];
      currentMessages = last?.role === 'assistant'
        ? [...currentMessages.slice(0, -1), { ...last, content }]
        : [...currentMessages, { id: Math.random().toString(36).slice(2), role: 'assistant', content, timestamp: Date.now() }];
      conversationHistory.push({ role: 'user', content: task }, { role: 'assistant', content: result.output.slice(0, 2000) });
      if (conversationHistory.length > 20) conversationHistory.splice(0, conversationHistory.length - 20);
      if (!exiting) tui.update({ messages: currentMessages });
      await this.sessionStore.save(orchestrator.exportState(sessionId, task, mode));
      return result;
    };

    const onSendMessage = async (text: string) => {
      try {
        await runOperation(async (mode, preset, signal) => {
          currentAgents = [];
          activeTool = undefined;
          currentMessages = [...currentMessages, {
            id: Math.random().toString(36).slice(2), role: 'user', content: text, timestamp: Date.now(),
          }];
          tui.update({ messages: currentMessages, agents: currentAgents, tokenUsage: computeTokenUsage(), activeTool: undefined });
          await executeTask(text, mode, preset, signal);
        });
      } catch (err) {
        const errorMsg = formatProviderError(err);
        currentEvents = [...currentEvents, { id: Math.random().toString(36).slice(2), timestamp: Date.now(), type: 'error', message: errorMsg }].slice(-50);
        notice(`Error: ${errorMsg}`);
        if (!exiting) tui.update({ events: currentEvents });
      }
    };

    const runTask: NonNullable<import('@chimera/tui').CommandContext['runTask']> = (task, options) => runOperation(async (mode, preset, signal) => {
      const iterations = options.kind === 'loop' ? options.maxIterations ?? 1 : 1;
      if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100) throw new Error('Loop iterations must be between 1 and 100.');
      if (options.kind === 'goal' && mapped.fallback.some(provider => provider.getModel().provider === 'mock')) {
        throw new Error('Goal execution requires a configured real provider. Run `chimera setup` first.');
      }
      const baseline = orchestrator.getCostTracker().getTotalCost();
      loopState = { kind: options.kind, task, maxIterations: iterations, currentIteration: 0, status: 'running', startedAt: Date.now() };
      try {
        let result!: OrchestratorResult;
        if (options.kind === 'goal') {
          loopState.currentIteration = 1;
          result = await executeTask(task, mode, preset, signal, options.verificationCommands, 10, true);
        } else for (let i = 0; i < iterations; i++) {
          signal.throwIfAborted();
          const remaining = 10 - (orchestrator.getCostTracker().getTotalCost() - baseline);
          if (remaining <= 0) throw new Error('Task spending limit exceeded ($10).');
          loopState.currentIteration = i + 1;
          result = await executeTask(task, mode, preset, signal, options.verificationCommands, remaining);
          if (result.status !== 'done') break;
        }
        loopState.status = result.status === 'done' ? 'completed' : 'failed';
        return { status: result.status, output: result.output, cost: orchestrator.getCostTracker().getTotalCost() - baseline };
      } catch (err) {
        loopState.status = 'failed';
        throw err;
      }
    });

    const runWorkflow: NonNullable<import('@chimera/tui').CommandContext['runWorkflow']> = (name, args) => runOperation(async (mode, _preset, signal) => {
      const found = findInSources(await loadWorkflowRegistry(workspaceRoot), name);
      signal.throwIfAborted();
      if (!found) return null;
      const inputs = args.trim().startsWith('{') ? JSON.parse(args) : { args, task: args };
      const result = await runWorkflowInContext(found.definition, ctx, {
        inputs, mode, signal, workspaceRoot, sessionId,
        eventStream: orchestrator.getEventStream(), costTracker: orchestrator.getCostTracker(),
      });
      return { status: result.status, output: result.error ?? JSON.stringify(result.outputs) };
    });

    const onModeChange = (mode: Mode) => {
      if (activeController || restoringSession) { notice('Cannot change mode while an operation is active.'); return; }
      currentMode = mode;
      ctx.toolExecutor.setPermissionEngine(buildPermissionEngine(mode, yolo, interactive));
      tui.update({ mode });
    };
    const onPresetChange = (preset: DeliberationMode) => {
      if (activeController || restoringSession) { notice('Cannot change preset while an operation is active.'); return; }
      currentPreset = preset;
      tui.update({ preset });
    };
    const commandContext: Partial<import('@chimera/tui').CommandContext> = {
      get sessionId() { return sessionId; },
      getMode: () => currentMode, setMode: onModeChange,
      getPreset: () => currentPreset, setPreset: onPresetChange,
      getCostData: buildLiveCostData,
      getAggregateCost: () => orchestrator.getCostTracker().getTotalCost(),
      getRoleSpend: role => orchestrator.getCostTracker().getSpend(role),
      getTokenUsage: () => Object.entries(orchestrator.getCostTracker().getSpendByProvider()).map(([role, spend]) => ({ role, spend })),
      getLoopState: () => loopState,
      listSessions: async () => (await this.sessionStore.list()).map(({ id, mode, status, task }) => ({ id, mode, status, task })),
      loadSession: async id => { const checkpoint = await this.sessionStore.load(id); return checkpoint ? { task: checkpoint.task, mode: checkpoint.mode } : null; },
      getSessionCount: async () => (await this.sessionStore.list()).length,
      getMemoryEntries: () => this.memory.getAll(),
      getMemorySize: () => this.memory.size(),
      getProviders: async () => mapped.fallback.map(provider => ({ getModel: () => {
        const { provider: name, name: modelName, id, contextWindow } = provider.getModel();
        return { provider: name, name: modelName, id, contextWindow };
      } })),
      hasOrchestrator: () => !exiting,
      getEventStream: () => ({ getAll: () => orchestrator.getEventStream().getAll().map(event => ({ ...event })) }),
      initAgentsMd: async (cwd, options) => (await import('./commands/init.js')).initAgentsMd(cwd, options),
      readConfig: async () => {
        const config = loadConfig();
        return config ? {
          providers: config.providers.map(({ name, provider, model, role }) => ({ name, provider, model, role })),
          defaults: { preset: config.defaults?.preset },
        } : null;
      },
      skillModel, runTask, runWorkflow,
    };

    try {
      currentCostData = buildLiveCostData();
      tui = runTUI({
        mode: currentMode, preset: currentPreset, messages: currentMessages, agents: currentAgents,
        costData: currentCostData, tokenUsage: computeTokenUsage(), diffFiles: currentDiffFiles,
        events: currentEvents, sessions: await loadSessions(), sessionId, activeTool,
        workingDir: workspaceRoot, skillModel, commandContext, isRunning: false,
        onCancel: () => { activeController?.abort(new Error('Cancelled by user')); },
        runWorkflow, runTask, onSendMessage, onModeChange, onPresetChange,
        onSessionSelect: async id => {
          if (activeController || restoringSession || exiting) { notice('Cannot change session while an operation is active.'); return; }
          restoringSession = true;
          try {
            const checkpoint = await this.sessionStore.load(id);
            if (!checkpoint) throw new Error('Session not found');
            await orchestrator.restoreState(checkpoint);
            currentMessages = [];
            currentAgents = [];
            currentEvents = [];
            currentDiffFiles = [];
            sessionId = checkpoint.sessionId;
            currentMode = checkpoint.mode;
            ctx.toolExecutor.setPermissionEngine(buildPermissionEngine(currentMode, yolo, interactive));
            currentMessages = checkpoint.messages.filter(message => message.role === 'user' || message.role === 'assistant').map((message, index) => ({
              id: `${sessionId}-${index}`, role: message.role as 'user' | 'assistant', content: message.content, timestamp: Date.now(),
            }));
            conversationHistory.splice(0, conversationHistory.length, ...currentMessages.slice(-20).map(({ role, content }) => ({ role, content })));
            currentCostData = buildLiveCostData();
            tui.update({ sessionId, mode: currentMode, commandContext, messages: currentMessages, agents: currentAgents,
              events: currentEvents, diffFiles: currentDiffFiles, costData: currentCostData, tokenUsage: computeTokenUsage() });
            notice(`Session ${sessionId} loaded: ${checkpoint.task.slice(0, 80)}`);
          } catch (err) {
            notice(`Failed to load session: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            restoringSession = false;
          }
        },
        onSessionDelete: async id => {
          if (restoringSession || (activeController && id === sessionId)) { notice('Cannot delete the active session while an operation is active.'); return; }
          try {
            if (!await this.sessionStore.delete(id)) throw new Error('Session not found or could not be deleted');
            tui.update({ sessions: await loadSessions() });
          } catch (err) {
            notice(`Failed to delete session: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
        onExit: async () => {
          await shutdown();
          return this.exitAfterLspShutdown();
        },
      });

      // Subscribe to events and update TUI state
      unsubscribe = orchestrator.getEventStream().subscribe('*', (event) => {
        if (restoringSession || exiting) return;
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
        } else if (event.type === 'patch_proposed') {
          // Surface proposed changes in the DiffViewer (/diff, Ctrl+D).
          const files = (event as any).files as string[] | undefined;
          currentDiffFiles = collectDiffFiles(files);
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

        // ── Live cost from the tracker ──────────────────────────────────
        currentCostData = buildLiveCostData();
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
            : (lastMsg?.role === 'assistant' ? lastMsg.content : `No response (status: ${(event as any).status ?? 'unknown'}).`);

          // Update cost from the final_response cost field
          if ((event as any).cost !== undefined) {
            currentCostData = buildLiveCostData();
          }

          if (lastMsg && lastMsg.role === 'assistant') {
            // Preserve analysis from deliberation_result if content is the same
            // (avoids overwriting analysis with undefined when both events fire)
            const contentChanged = content !== lastMsg.content;
            currentMessages = [
              ...currentMessages.slice(0, -1),
              {
                ...lastMsg,
                content,
                // Only clear analysis if content actually changed and event has no analysis
                analysis: contentChanged ? (lastMsg.analysis ?? undefined) : lastMsg.analysis,
                timestamp: Date.now(),
              }
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
          tokenUsage: computeTokenUsage(),
          diffFiles: currentDiffFiles,
          activeTool,
        });
      });

      if (initialTask) await onSendMessage(initialTask);
      await tui.waitUntilExit();
    } finally {
      await shutdown();
    }
  }


  private async executeWorkflowDefinition(
    definition: import('@chimera/core').WorkflowDefinition,
    inputs: Record<string, unknown>,
    mode: Mode,
    eventStream?: EventStream,
  ) {
    const context = await this.buildRunContext(mode, { yolo: this.program.opts().yolo === true, interactive: process.stdin.isTTY === true });
    try {
      return await runWorkflowInContext(definition, context, {
        inputs, mode, workspaceRoot: process.cwd(),
        sessionId: this.sessionStore.generateSessionId(),
        eventStream: eventStream ?? context.orchestrator.getEventStream(),
        costTracker: context.orchestrator.getCostTracker(),
      });
    } finally { context.orchestrator.dispose(); }
  }

  private async runNamedWorkflow(name: string, args: string, mode: Mode) {
    const found = findInSources(await loadWorkflowRegistry(process.cwd()), name);
    if (!found) return null;
    const inputs = args.trim().startsWith('{') ? JSON.parse(args) : { args, task: args };
    const result = await this.executeWorkflowDefinition(found.definition, inputs, mode);
    return { status: result.status, output: result.error ?? JSON.stringify(result.outputs) };
  }

  private async exitAfterLspShutdown(): Promise<void> {
    try {
      await disposeAllLspServices();
    } catch (error) {
      console.error('LSP shutdown failed:', error);
      process.exit(1);
      return;
    }
    process.exit(0);
  }

  private async startRepl(): Promise<void> {
    // Auto-generate config from env vars (fetches models from API if needed)
    if (!configExists()) {
      const generated = await autoGenerateConfig();
      if (generated) {
        console.log(`  \u2713 Auto-configured from environment (${generated.providers.length} providers)`);
      }
    }

    // #6 — Validate providers before entering REPL
    const preflightMapped = await this.getRoleMappedProviders();
    validateStartupProviders(preflightMapped);

    console.log('\n  Chimera \u2014 interactive mode');
    console.log('  Type your task, or /help for commands.\n');

    let currentMode: Mode = 'code';
    let currentPreset: DeliberationMode = getDefaultPreset() ?? 'solo';
    let sessionId = this.sessionStore.generateSessionId();
    const history: string[] = [];
    const conversationHistory: Array<{ role: string; content: string }> = [];
    let loopState: { kind: 'loop' | 'goal'; task: string; maxIterations: number; currentIteration: number; status: 'running' | 'completed' | 'failed'; startedAt: number } | null = null;

    // Scheduler: 60s cron timer that fires loop workflows. Provider factory
    // is injected so schedules actually run; null factory → no-op triggers.
    // ponytail: single in-process timer, fine for one REPL; per-workspace
    // instances if multiple REPLs ever share a root.
    const scheduler = new SchedulerManager(
      null,
      new EventStream(),
      process.cwd(),
      async () => {
        const mapped = await this.getRoleMappedProviders();
        if (mapped.fallback.length === 0) return null;
        return {
          providers: {
            writer: adaptProvider(mapped.writer ?? mapped.fallback[0]),
            reviewer: adaptProvider(mapped.reviewer ?? mapped.writer ?? mapped.fallback[0]),
          },
        };
      },
    );
    scheduler.start();

    // One skill model per session — fed by signals as they occur.
    const skillModel = new UserSkillModel();
    const style = await resolveActiveStyle(process.cwd(), this.noLearn || this.program.opts().learn === false ? undefined : skillModel);
    // Capabilities the user has touched this session (drives the value nudge).
    const seenCapabilities = new Set<ObservedCapability>();
    // Surface one underused capability at a natural pause (task completion),
    // throttled so it never interrupts mid-task (Step 4 of adaptive onboarding).
    let turnsSinceNudge = 0;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'chimera> ',
    });

    // Build a ReplContext that bridges local state to the registry handlers
    const replCtx: ReplContext = {
      getMode: () => currentMode,
      executeWorkflow: (name, args) => this.runNamedWorkflow(name, args, currentMode),
      setMode: (m) => { currentMode = m; },
      getPreset: () => currentPreset,
      setPreset: (p) => { currentPreset = p; },
      sessionId,
      history,
      skillModel,
      latestReplResult: null,
      setLatestReplResult: () => {},
      currentOrchestrator: null,
      setCurrentOrchestrator: () => {},
      getLoopState: () => loopState,
      setLoopState: (s) => { loopState = s; },
      getScheduler: () => scheduler,
      memory: this.memory,
      adaptProvider,
      getProviders: () => this.getProviders(),
      getSessionStore: () => this.sessionStore,
      printResult: (r) => this.printResult(r, skillModel),
      initOrchestrator: () => this.initOrchestrator(currentMode),
      executeGoal: (task, verificationCommands) => this.executeGoal(task, verificationCommands),
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
        const signal = await runSlashCommand(cmd!, args, replCtx, input.slice(cmd!.length + 1).trim());
        if (signal === 'exit') {
          rl.close();
          return;
        }
        rl.prompt();
        return;
      }

      // Process task
      history.push(input);

      // Feed observable behavior into the skill model so explanation depth
      // tracks the user in real time (Step 2 of the adaptive-onboarding work).
      skillModel.observeMessage(input);
      if (/explain more|teach me|for a beginner|more detail|i'?m new|i am new/i.test(input)) {
        skillModel.setExplainMore();
      } else if (/skip the explanation|explain less|less detail|don'?t explain|just do it|just do the task/i.test(input)) {
        skillModel.setExplainLess();
      }

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

      const orchestrator = await this.initOrchestrator(currentMode);

      try {
        const taskWithContext = memoryContext ? `${input}${memoryContext}` : input;
        const result = await orchestrator.execute({
          task: taskWithContext,
          mode: currentMode,
          providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
          preset: currentPreset,
          conversationHistory,
          skillModel,
          style,
        });

        this.printResult(result, skillModel);
        skillModel.observeTaskOutcome({ clean: result.status === 'done' });

        // Track which capabilities the user has exercised (for the nudge).
        const capFromInput = /^\/(loop|goal|sessions|resume|skill|learn|workflow|export|hooks|vim|teleport|eval|doctor|mcp|ide)/i.exec(input.trim());
        if (capFromInput) {
          const map: Record<string, ObservedCapability> = {
            loop: 'loop', goal: 'goal', sessions: 'sessions', resume: 'sessions',
            skill: 'skill', learn: 'learn', workflow: 'workflow', export: 'export',
            hooks: 'hooks', vim: 'vim', teleport: 'teleport', eval: 'eval',
            doctor: 'doctor', mcp: 'mcp', ide: 'ide',
          };
          const cap = map[capFromInput[1]!.toLowerCase()];
          if (cap) seenCapabilities.add(cap);
          if (/--preset/.test(input)) seenCapabilities.add('preset');
          if (/chimera (init|setup)|config\.yaml|CHIMERA_/i.test(input)) seenCapabilities.add('config');
        }

        // Natural-pause nudge: suggest ONE underused capability, throttled and
        // non-intrusive (Step 4). Calibrated to the inferred skill level.
        turnsSinceNudge += 1;
        if (turnsSinceNudge >= 3 && result.status === 'done') {
          turnsSinceNudge = 0;
          const suggestion = suggestNextValue(skillModel, Array.from(seenCapabilities));
          if (suggestion) {
            if (this.verbose) {
              console.log(`  [skill] ${skillModel.tierReason()} → suggesting "${suggestion.id}"`);
            }
            console.log(`\n  💡 ${suggestion.tip}\n`);
          }
        }

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
        const msg = formatProviderError(err);
        console.error(`\n\u2717 Error:\n${msg}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n  Goodbye.\n');
      scheduler.stop();
      void this.exitAfterLspShutdown();
    });
  }

  private async runParallel(task: string, verificationCommands: string[] = [], commandOptions: Record<string, unknown> = {}): Promise<void> {
    await this.run('code', task, 'hive', verificationCommands, commandOptions);
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

  private async runGoal(goal: string, verificationCommands: string[] = []): Promise<void> {
    console.log(`\n◎ Chimera goal — "${goal}"\n`);
    try {
      const result = await this.executeGoal(goal, verificationCommands);
      this.printResult(result);
      if (result.status !== 'done') process.exitCode = 1;
      else if (!verificationCommands.length) console.log('  Note: completed without caller-supplied verification; not independently verified.');
    } catch (err) {
      console.error(`\n✗ Goal failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  }

  private async executeGoal(goal: string, verificationCommands: string[] = [], options?: {
    context?: RunContext; signal?: AbortSignal; mode?: Mode; preset?: DeliberationMode;
  }): Promise<OrchestratorResult> {
    const context = options?.context ?? await this.buildRunContext(options?.mode ?? 'code', {
      yolo: this.program.opts().yolo === true || process.argv.includes('--yolo'),
      interactive: process.stdin.isTTY === true,
    });
    const mapped = await this.getRoleMappedProviders();
    const writerProvider = mapped.writer ?? mapped.fallback[0];
    const reviewerProvider = mapped.reviewer ?? writerProvider;
    if (!writerProvider || !reviewerProvider || writerProvider.getModel().provider === 'mock' || reviewerProvider.getModel().provider === 'mock') {
      if (!options?.context) context.orchestrator.dispose();
      throw new Error('Goal execution requires a configured real provider. Run `chimera setup` first.');
    }
    const signal = AbortSignal.any([AbortSignal.timeout(5 * 60_000), ...(options?.signal ? [options.signal] : [])]);
    let providerCalls = 0;
    const budgetError = new Error('Goal provider call limit of 20 exceeded.');
    const boundedProvider = (provider: ModelProvider) => {
      const adapted = adaptProvider(provider);
      return {
        ...adapted,
        async complete(...args: Parameters<typeof adapted.complete>) {
          signal.throwIfAborted();
          if (++providerCalls > 20) throw budgetError;
          return withAbort(() => adapted.complete(...args), signal);
        },
      };
    };
    const writer = boundedProvider(writerProvider);
    const reviewer = boundedProvider(reviewerProvider);
    console.log(`  Progress: bounded to 20 provider calls and 5 minutes; verification checks: ${verificationCommands.length}.`);
    try {
      const execute = context.orchestrator.execute as unknown as (params: {
        task: string; mode: Mode; providers: { writer: typeof writer; reviewer: typeof reviewer };
        preset: DeliberationMode; costCap: number;
        verificationCommands?: string[]; signal?: AbortSignal;
      }) => Promise<OrchestratorResult>;
      const execution = execute.call(context.orchestrator, {
        task: goal,
        mode: options?.mode ?? 'code',
        providers: { writer, reviewer },
        preset: options?.preset ?? 'solo',
        costCap: 10,
        ...(verificationCommands.length ? { verificationCommands } : {}),
        signal,
      });
      const result = await execution;
      signal.throwIfAborted();
      if (providerCalls > 20) throw budgetError;
      return result;
    } catch (err) {
      throw err;
    } finally {
      if (!options?.context) context.orchestrator.dispose();
    }
  }

  /** Print the full list of supported modes to stdout. Used by tests. */
  printModeList(): void {
    const modes = ['ask', 'plan', 'code', 'debug', 'review', 'oal', 'auto'];
    console.log(`  Available modes: ${modes.join(', ')}`);
  }

  async runCli(argv: string[]): Promise<void> {
    // Read --mode before parseAsync (commander only populates opts after
    // parsing, which would already have launched the TUI/REPL).
    const modeIdx = argv.indexOf('--mode');
    const mode = modeIdx !== -1 ? argv[modeIdx + 1] : undefined;
    const informational = argv.slice(2).some(arg => ['--help', '-h', '--version', '-V'].includes(arg));
    if (mode === 'rpc' && !informational) {
      this.initializeRuntime();
      // Headless JSON-RPC over stdio — same protocol as the standalone
      // daemon, but inside this process (no separate daemon to boot).
      // Reuses ChimeraDaemon + its stdio loop; no second protocol.
      const { ChimeraDaemon, runStdioServer } = await import('@chimera/daemon');
      try { await runStdioServer(new ChimeraDaemon()); }
      finally { await disposeAllLspServices(); }
      return;
    }
    this.program.hook('preAction', () => this.initializeRuntime());
    this.program.hook('postAction', async (_root, command) => {
      if (command !== this.program && !command.opts().tui && !this.program.opts().repl) {
        await disposeAllLspServices();
      }
    });
    await this.program.parseAsync(argv);
  }
}
