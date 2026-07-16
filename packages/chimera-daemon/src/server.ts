// ---------------------------------------------------------------------------
// Chimera daemon — JSON-RPC 2.0 server over stdio
// ---------------------------------------------------------------------------

import path from 'path';
import { EventStream, SessionOrchestrator, SchedulerManager, type ChimeraEvent } from '@chimera/core';
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
  orchestrator: SessionOrchestrator;
}

export class ChimeraDaemon {
  private workers: Map<string, Worker> = new Map();
  private workerCounter = 0;
  private readonly startTime = Date.now();
  private eventStream: EventStream;
  private activeSubscriptions = new Map<string, () => void>();
  private scheduler: SchedulerManager;

  constructor() {
    this.eventStream = new EventStream();
    // Headless schedule management. onTrigger routes scheduled work through
    // executeTask — the daemon's single execution path. (Note: executeTask
    // currently uses a stub writer until real provider bridging lands, so
    // scheduled runs mirror that limitation rather than faking agents.)
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
          return this.streamEvents(id as string | number);

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
    const { task, mode = 'code', workspaceRoot: rawRoot } = raw;
    const workspaceRoot = this.validateWorkspaceRoot(rawRoot);

    // Load config for the workspace, auto-generate from env vars if missing
    let cfg = configLoader.loadConfig(workspaceRoot);
    if (!cfg) {
      cfg = await configLoader.autoGenerateConfig(workspaceRoot);
      if (!cfg) {
        throw new Error(
          'No .chimera/config.yaml found and no API keys in environment. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.',
        );
      }
    }

    // Bootstrap chimera
    const { workflowRegistry } = bootstrap();

    // Create orchestrator
    const orchestrator = new SessionOrchestrator(
      this.eventStream,
      undefined,
      workspaceRoot,
    );

    // Create worker record
    const workerId = `worker-${++this.workerCounter}`;
    const worker: Worker = {
      id: workerId,
      task,
      mode,
      startedAt: Date.now(),
      orchestrator,
    };
    this.workers.set(workerId, worker);

    try {
      // Execute the task via orchestrator
      const result = await orchestrator.executeWorkflow(task, {
        writer: { complete: async (messages) => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }) },
      });

      // Get final state
      const state = orchestrator.getState();
      const costTracker = orchestrator.getCostTracker();
      const byRole = configLoader.getProvidersByRole(cfg, mode);
      const resolvedProviders = configLoader.resolveProviders(cfg);
      const totalCost = resolvedProviders.reduce(
        (acc, p) => acc + costTracker.getSpend(p.name),
        0,
      );

      return {
        status: state.status === 'complete' ? 'done' : state.status === 'error' ? 'error' : 'blocked',
        output: state.status === 'complete' ? (state as any).result : (state as any).error || '',
        cost: totalCost,
        agentCount: this.workers.size,
        events: [...this.eventStream.getAll()],
      };
    } finally {
      this.workers.delete(workerId);
    }
  }

  private getState(): GetStateResult {
    const costTracker = Array.from(this.workers.values())[0]?.orchestrator.getCostTracker();
    const cost: Record<string, number> = {};
    if (costTracker) {
      // Collect cost from all providers
      const allEvents = this.eventStream.getAll();
      for (const evt of allEvents) {
        if (evt.type === 'agent_spawned') {
          if (!cost[evt.provider]) cost[evt.provider] = 0;
        }
      }
    }

    return {
      status: this.workers.size > 0 ? 'running' : 'idle',
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
    const byProvider: Record<string, number> = {};
    const budgetPerProvider: Record<string, { perTask: number; perSession: number; perDay: number }> = {};
    let total = 0;

    if (workers.length > 0) {
      const costTracker = workers[0].orchestrator.getCostTracker();
      if (costTracker) {
        const allEvents = this.eventStream.getAll();
        for (const evt of allEvents) {
          if (evt.type === 'agent_spawned') {
            const spend = costTracker.getSpend(evt.provider);
            if (!byProvider[evt.provider]) byProvider[evt.provider] = 0;
            byProvider[evt.provider] += spend;
            total += spend;
          }
        }
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
    const idStr = String(id);
    const unsubscribe = this.eventStream.subscribe('*', (event: ChimeraEvent) => {
      writeMessage({
        jsonrpc: '2.0',
        method: 'event',
        params: { event },
      } as any);
    });

    this.activeSubscriptions.set(idStr, unsubscribe);
    writeMessage(success(id, { streaming: true }));
  }

  private cleanupSubscription(id: string): void {
    const unsub = this.activeSubscriptions.get(id);
    if (unsub) {
      unsub();
      this.activeSubscriptions.delete(id);
    }
  }

  dispose(): void {
    for (const [id] of this.activeSubscriptions) {
      this.cleanupSubscription(id);
    }
  }

  cleanupSubscriptions(): void {
    this.dispose();
  }
}