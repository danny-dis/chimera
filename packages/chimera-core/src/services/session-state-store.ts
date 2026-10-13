import { randomUUID } from 'node:crypto';
import type {
  SessionId,
  SessionStatus,
  RunId,
  RunStatus,
  Complexity,
  AgentId,
  DomainEvent,
} from '@chimera/domain';

/**
 * Default SessionId when none is provided.
 */
function generateSessionId(): SessionId {
  return randomUUID();
}

/**
 * Generate a RunId.
 */
export function generateRunId(): RunId {
  return randomUUID();
}

// =============================================================================
// SessionStateStore — manages session/run lifecycle state
// =============================================================================

export class SessionStateStore {
  private sessionId: SessionId;
  private status: SessionStatus = 'initializing';
  private activeRunId: RunId | null = null;
  private currentTask: string | null = null;
  private complexity: Complexity | null = null;

  private runs: Map<RunId, {
    id: RunId;
    strategy: string;
    status: RunStatus;
    startedAt: number;
    costUsd: number;
    tokenCount: number;
    agentIds: AgentId[];
  }> = new Map();

  constructor(sessionId?: SessionId) {
    this.sessionId = sessionId ?? generateSessionId();
  }

  // --- Session ---

  getSessionId(): SessionId {
    return this.sessionId;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  setStatus(status: SessionStatus): void {
    this.status = status;
  }

  // --- Active Run ---

  getActiveRunId(): RunId | null {
    return this.activeRunId;
  }

  setActiveRunId(runId: RunId | null): void {
    this.activeRunId = runId;
  }

  // --- Current Task ---

  getCurrentTask(): string | null {
    return this.currentTask;
  }

  setCurrentTask(task: string | null): void {
    this.currentTask = task;
  }

  // --- Complexity ---

  getComplexity(): Complexity | null {
    return this.complexity;
  }

  setComplexity(complexity: Complexity | null): void {
    this.complexity = complexity;
  }

  // --- Run Records ---

  startRun(runId: RunId, strategy: string): void {
    this.runs.set(runId, {
      id: runId,
      strategy,
      status: 'pending',
      startedAt: Date.now(),
      costUsd: 0,
      tokenCount: 0,
      agentIds: [],
    });
    this.activeRunId = runId;
  }

  updateRun(runId: RunId, updates: {
    status?: RunStatus;
    agentId?: AgentId;
    costUsd?: number;
    tokenCount?: number;
  }): void {
    const run = this.runs.get(runId);
    if (!run) return;
    if (updates.status) run.status = updates.status;
    if (updates.costUsd !== undefined) run.costUsd = updates.costUsd;
    if (updates.tokenCount !== undefined) run.tokenCount = updates.tokenCount;
    if (updates.agentId && !run.agentIds.includes(updates.agentId)) {
      run.agentIds.push(updates.agentId);
    }
  }

  completeRun(runId: RunId): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'completed';
    }
  }

  getRun(runId: RunId): {
    id: RunId;
    strategy: string;
    status: RunStatus;
    startedAt: number;
    costUsd: number;
    tokenCount: number;
    agentIds: AgentId[];
  } | null {
    return this.runs.get(runId) ?? null;
  }

  getAllRuns(): Array<{
    id: RunId;
    strategy: string;
    status: RunStatus;
    startedAt: number;
    costUsd: number;
    tokenCount: number;
    agentIds: AgentId[];
  }> {
    return [...this.runs.values()];
  }
}
