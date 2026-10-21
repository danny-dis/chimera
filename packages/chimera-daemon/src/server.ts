// ---------------------------------------------------------------------------
// Chimera daemon — JSON-RPC 2.0 server over stdio
// ---------------------------------------------------------------------------

import path from 'path';
import { EventStream, SessionOrchestrator, SchedulerManager, adaptProvider, createRuntimeMemory, withAbort, type Mode, type ChimeraEvent, type ToolRegistryInterface, type ToolExecutorInterface } from '@chimera/core';
import { ProviderFactory } from '@chimera/providers';
import {
  ToolRegistry,
  ToolExecutor,
  HookExecutor,
  PermissionEngine,
  readOnlyProfile,
  editFilesProfile,
  allTools,
  getDiagnosticsForFile,
} from '@chimera/tools';
import { bootstrap, type WorkflowRegistry } from './bootstrap.js';
import { writeMessage, success, error, ErrorCodes } from './json-rpc.js';
import type {
  JsonRpcRequest,
  ExecuteTaskParams,
  ExecuteTaskResult,
  GetStateResult,
  ListAgentsResult,
  GetConfigResult,
  GetCostResult,
  CheckHealthResult,
} from './types.js';
import * as configLoader from './config-loader.js';

interface Worker {
  id: string;
  task: string;
  mode: string;
  startedAt: number;
  orchestrator?: SessionOrchestrator;
  controller: AbortController;
}

export class ChimeraDaemon {
  private workers: Map<string, Worker> = new Map();
  private workerCounter = 0;
  private completedCost = 0;
  private readonly completedSpend: Record<string, number> = Object.create(null);
  private disposed = false;
  private readonly startTime = Date.now();
  private eventStream: EventStream;
  private activeSubscriptions = new Map<string | number, () => void>();
  private scheduler: SchedulerManager;

  constructor() {
    this.eventStream = new EventStream();
    // Scheduled work uses the same configured providers and policy as RPC tasks.
    this.scheduler = new SchedulerManager(null, this.eventStream, process.cwd());
    this.scheduler.onTrigger = (entry, _workflow) => {
      void this.executeTask({
        task: (entry.task as string) ?? '',
        mode: 'code',
        workspaceRoot: process.cwd(),
      }).catch((err) => {
        this.eventStream.append({ type: 'workflow_dispatch_failed' as any, error: String(err) } as any);
      });
    };
    this.scheduler.start();
  }

  getEventStream(): EventStream {
    return this.eventStream;
  }

  async handleRequest(request: JsonRpcRequest): Promise<void> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'ping':
          return writeMessage(success(id, 'pong'));

        case 'execute_task':
          return writeMessage(
            success(id, await this.executeTask(params as unknown as ExecuteTaskParams)),
          );

        case 'cancel_task': {
          const workerId = params?.workerId;
          if (typeof workerId !== 'string') throw new Error('workerId must be a string');
          const worker = this.workers.get(workerId);
          worker?.controller.abort(new Error('Task cancelled by caller'));
          return writeMessage(success(id, { cancelled: !!worker }));
        }

        case 'get_state':
          return writeMessage(
            success(id, this.getState()),
          );

        case 'list_agents':
          return writeMessage(
            success(id, this.listAgents()),
          );

        case 'get_config':
          return writeMessage(
            success(id, this.getConfig(params as unknown as { workspaceRoot: string })),
          );

        case 'save_config':
          return writeMessage(
            success(id, this.saveConfig(params as unknown as { workspaceRoot: string; config: unknown })),
          );

        case 'get_cost':
          return writeMessage(
            success(id, this.getCost()),
          );

        case 'check_health':
          return writeMessage(
            success(id, this.checkHealth()),
          );

        case 'stream_events':
          return await this.streamEvents(id as string | number);

        // ── Scheduling ───────────────────────────────────────────────
        case 'schedule_list':
          return writeMessage(success(id, this.scheduler.listSchedules()));

        case 'schedule_add':
          return writeMessage(
            success(id, this.scheduler.addSchedule(params as unknown as Parameters<SchedulerManager['addSchedule']>[0])),
          );

        case 'schedule_remove':
          return writeMessage(
            success(id, this.scheduler.removeSchedule((params as { id: string }).id)),
          );

        case 'schedule_toggle': {
          const { id, enabled } = params as { id: string; enabled: boolean };
          const ok = enabled ? this.scheduler.enableSchedule(id) : this.scheduler.disableSchedule(id);
          return writeMessage(success(id, { ok }));
        }

        default:
          return writeMessage(error(id, ErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return writeMessage(error(id, ErrorCodes.INTERNAL_ERROR, msg));
    }
  }

  // -----------------------------------------------------------------------
  // Methods
  // -----------------------------------------------------------------------

  private validateWorkspaceRoot(root: string): string {
    const resolved = path.resolve(root);
    if (resolved.includes('..')) {
      throw new Error('Invalid workspace root: path traversal detected');
    }
    return resolved;
  }

  private async executeTask(raw: ExecuteTaskParams): Promise<ExecuteTaskResult> {
    if (this.disposed) throw new Error('Daemon disposed');
    const { task, mode = 'code', workspaceRoot: rawRoot } = raw;
    if (!['ask', 'plan', 'code', 'debug', 'review', 'oal', 'auto'].includes(mode)) throw new Error('Invalid task mode');
    if (typeof task !== 'string' || !task.trim()) throw new Error('Task must be a nonempty string');
    const workspaceRoot = this.validateWorkspaceRoot(rawRoot);

    const controller = new AbortController();
    const workerId = `worker-${++this.workerCounter}`;
    const worker: Worker = { id: workerId, task, mode, startedAt: Date.now(), controller };
    this.workers.set(workerId, worker);

    try {
      // Load config for the workspace, auto-generate from env vars if missing
      let cfg = configLoader.loadConfig(workspaceRoot);
      if (!cfg) {
        cfg = await withAbort(() => configLoader.autoGenerateConfig(workspaceRoot), controller.signal);
        controller.signal.throwIfAborted();
        if (this.disposed) throw new Error('Daemon disposed');
        if (!cfg) {
          throw new Error(
            'No .chimera/config.yaml found and no API keys in environment. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.',
          );
        }
      }

      const resolved = configLoader.resolveProviders(cfg);
      const byRole = configLoader.getProvidersByRole(cfg, mode);
      const makeProvider = (role: 'writer' | 'reviewer' | 'challenger') => {
        const selected = byRole[role] ?? (role === 'challenger' ? undefined : byRole.writer ?? resolved[0]);
        if (!selected) return undefined;
        const entry = resolved.find(provider => provider.name === selected.name)!;
        const configured = cfg.providers.find(provider => provider.name === entry.name);
        const limits = configured?.constraints;
        const provider = ProviderFactory.create({ ...entry, constraints: {
          maxTokensPerTurn: limits?.max_tokens_per_turn ?? 4096,
          costCapPerTask: limits?.cost_cap_per_task ?? 1,
          costCapPerSession: limits?.cost_cap_per_session ?? 20,
          costCapPerDay: limits?.cost_cap_per_day ?? 50,
          maxParallelInstances: limits?.max_parallel_instances ?? 1,
          rateLimitRpm: limits?.rate_limit_rpm ?? 60,
        } });
        if (provider.getModel().provider === 'mock') throw new Error('Daemon execution requires a configured real provider');
        return adaptProvider(provider);
      };
      const writer = makeProvider('writer');
      const reviewer = makeProvider('reviewer');
      const challenger = makeProvider('challenger');
      if (!writer || !reviewer) throw new Error('Daemon execution requires writer and reviewer providers');
      const runtimeMemory = await withAbort(() => createRuntimeMemory(workspaceRoot, writer), controller.signal);
      controller.signal.throwIfAborted();
      if (this.disposed) throw new Error('Daemon disposed');
      bootstrap();

      // Wire the tool system so daemon workers run real tools through the same
      // hook-gated gateway as the interactive CLI (previously tools: undefined,
      // which left workers unable to call tools or hit pre-tool-use hooks).
      const toolRegistry = new ToolRegistry();
      const hookExecutor = new HookExecutor();
      const toolExecutor = new ToolExecutor(
        toolRegistry,
        () => 'deny' as const,
        undefined,
        hookExecutor,
      );
      for (const tool of allTools) {
        toolRegistry.register(tool as unknown as Parameters<typeof toolRegistry.register>[0]);
      }

      // Mode-based permission gating, mirroring the interactive CLI
      // (cli-router.ts). Without this the daemon ran every wired tool under a
      // blanket 'allow' with no policy engine, so a VS Code request in a
      // read-only mode (plan/ask/review) could still write and run shell.
      // The profiles never return 'ask', so a headless daemon never stalls
      // waiting on a stdin prompt that will never arrive.
      toolExecutor.setPermissionEngine(
        new PermissionEngine(
          mode === 'plan' || mode === 'ask' || mode === 'review'
            ? readOnlyProfile
            : editFilesProfile,
        ),
      );

      // Create orchestrator. Wire the same LSP diagnostics hook as the CLI
      // (cli-router.ts) so daemon sessions emit lsp_diagnostics events after
      // file edits. Best-effort: a diagnostics failure must never break task
      // execution (getDiagnosticsForFile already swallows errors, and the
      // orchestrator try/catches the call — this is defense in depth).
      const orchestrator = new SessionOrchestrator(
        this.eventStream,
        { registry: toolRegistry as unknown as ToolRegistryInterface, executor: toolExecutor as unknown as ToolExecutorInterface },
        workspaceRoot,
        undefined,
        {
          ...runtimeMemory,
          lspDiagnostics: (file: string) => {
            try {
              return getDiagnosticsForFile(workspaceRoot, file);
            } catch {
              return Promise.resolve([]);
            }
          },
        },
      );

      worker.orchestrator = orchestrator;

      const result = await orchestrator.execute({ task, mode: mode as Mode,
        providers: { writer, reviewer, ...(challenger ? { challenger } : {}) },
        costCap: cfg.providers.find(provider => provider.name === byRole.writer?.name)?.constraints?.cost_cap_per_task ?? 1, verificationCommands: raw.verificationCommands,
        signal: controller.signal,
      });

      return {
        status: result.status,
        output: result.output,
        cost: result.cost,
        agentCount: result.agentCount,
        events: result.events,
      };
    } finally {
      const tracker = worker.orchestrator?.getCostTracker();
      if (tracker) {
        this.completedCost += tracker.getTotalCost();
        for (const [provider, spend] of Object.entries(tracker.getSpendByProvider())) {
          this.completedSpend[provider] = (this.completedSpend[provider] ?? 0) + spend;
        }
      }
      this.workers.delete(workerId);
      worker.orchestrator?.dispose();
    }
  }

  private getState(): GetStateResult {
    const cost = this.getCost().byProvider;

    return {
      status: this.workers.size > 0 ? 'running' : 'idle',
      workers: Array.from(this.workers.values(), worker => ({
        id: worker.id,
        status: worker.controller.signal.aborted ? 'cancelling' : worker.orchestrator ? 'running' : 'initializing',
      })),
      cost,
      events: this.eventStream.getAll().slice(-50), // last 50 events
      hidden: this.eventStream.getAll().length,
    };
  }

  private listAgents(): ListAgentsResult {
    const agents: ListAgentsResult['agents'] = [];
    const allEvents = this.eventStream.getAll();

    for (const evt of allEvents) {
      if (evt.type === 'agent_spawned') {
        agents.push({
          id: evt.agentId,
          role: evt.role,
          provider: evt.provider,
          model: evt.model,
        });
      }
    }

    return { agents };
  }

  private getConfig(raw: { workspaceRoot: string }): GetConfigResult {
    const cfg = configLoader.loadConfig(raw.workspaceRoot);
    return {
      configured: cfg !== null,
      providers: cfg?.providers ?? [],
    };
  }

  private saveConfig(raw: { workspaceRoot: string; config: unknown }): { ok: boolean; error?: string } {
    if (!raw.workspaceRoot || typeof raw.workspaceRoot !== 'string') {
      return { ok: false, error: 'Invalid workspaceRoot' };
    }
    if (raw.config === null || raw.config === undefined || typeof raw.config !== 'object') {
      return { ok: false, error: 'Config must be a non-null object' };
    }
    try {
      configLoader.saveConfig(raw.config as Parameters<typeof configLoader.saveConfig>[0], raw.workspaceRoot);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  private getCost(): GetCostResult {
    const workers = Array.from(this.workers.values());
    const byProvider: Record<string, number> = Object.assign(Object.create(null), this.completedSpend);
    const budgetPerProvider: Record<string, { perTask: number; perSession: number; perDay: number }> = {};
    let total = this.completedCost;

    for (const worker of workers) {
      if (!worker.orchestrator) continue;
      const tracker = worker.orchestrator.getCostTracker();
      total += tracker.getTotalCost();
      for (const [provider, spend] of Object.entries(tracker.getSpendByProvider())) {
        byProvider[provider] = (byProvider[provider] ?? 0) + spend;
      }
    }

    return { total, byProvider, budgetPerProvider };
  }

  private checkHealth(): CheckHealthResult {
    return {
      status: 'ok',
      version: '0.0.1',
      uptime: Date.now() - this.startTime,
      activeWorkers: this.workers.size,
    };
  }

  private async streamEvents(id: string | number): Promise<void> {
    if (this.disposed) throw new Error('Daemon disposed');
    this.cleanupSubscription(id);
    const unsubscribe = this.eventStream.subscribe('*', (event: ChimeraEvent) => {
      writeMessage({
        jsonrpc: '2.0',
        method: 'event',
        params: { event },
      } as any);
    });

    this.activeSubscriptions.set(id, unsubscribe);
    writeMessage(success(id, { streaming: true }));
  }

  private cleanupSubscription(id: string | number): void {
    const unsub = this.activeSubscriptions.get(id);
    if (unsub) {
      unsub();
      this.activeSubscriptions.delete(id);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.scheduler.stop();
    for (const worker of this.workers.values()) {
      worker.controller.abort(new Error('Daemon disposed'));
      worker.orchestrator?.dispose();
    }
    for (const [id] of this.activeSubscriptions) {
      this.cleanupSubscription(id);
    }
  }

  cleanupSubscriptions(): void {
    this.dispose();
  }
}