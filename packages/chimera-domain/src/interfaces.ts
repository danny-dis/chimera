// =============================================================================
// Service interfaces for orchestrator decomposition (Phase 2).
// These contracts allow SessionOrchestrator to become a thin facade
// coordinating independent services.
// =============================================================================

import type {
  SessionId,
  RunId,
  AgentId,
  CheckpointId,
  SessionStatus,
  RunStatus,
  AgentStatus,
  Complexity,
  ModelCapability,
  ModelHealth,
  ToolPermission,
  Evidence,
  EvidenceBundle,
  Checkpoint,
  ToolCall,
  ToolResult,
  Artifact,
  DomainEvent,
} from './types.js';

// =============================================================================
// EventBus — decoupled state change notification
// =============================================================================

export interface EventBus {
  emit(event: DomainEvent): void;
  subscribe<T extends DomainEvent['type']>(
    type: T,
    listener: (event: Extract<DomainEvent, { type: T }>) => void,
  ): () => void;
  getAll(): ReadonlyArray<DomainEvent>;
  getByType<T extends DomainEvent['type']>(type: T): Array<Extract<DomainEvent, { type: T }>>;
  replay(fromIndex?: number): DomainEvent[];
}

// =============================================================================
// SessionStateStore — session/run lifecycle state
// =============================================================================

export interface SessionStateStore {
  getSessionId(): SessionId;
  getStatus(): SessionStatus;
  setStatus(status: SessionStatus, metadata?: Record<string, unknown>): void;
  getActiveRunId(): RunId | null;
  setActiveRunId(runId: RunId | null): void;
  getCurrentTask(): string | null;
  setCurrentTask(task: string | null): void;
  getComplexity(): Complexity | null;
  setComplexity(complexity: Complexity | null): void;
}

// =============================================================================
// RunController — per-run state and lifecycle
// =============================================================================

export interface RunController {
  startRun(strategy: string): RunId;
  updateRun(runId: RunId, updates: {
    status?: RunStatus;
    agentId?: AgentId;
    costUsd?: number;
    tokenCount?: number;
  }): void;
  completeRun(runId: RunId, result: {
    success: boolean;
    summary: string;
    filesChanged: string[];
    testsPassed?: number;
    testsFailed?: number;
    durationMs: number;
  }): void;
  getRun(runId: RunId): {
    id: RunId;
    strategy: string;
    status: RunStatus;
    startedAt: number;
    costUsd: number;
    tokenCount: number;
    agentIds: AgentId[];
  } | null;
}

// =============================================================================
// BudgetController — cost tracking and enforcement
// =============================================================================

export interface BudgetController {
  recordSpend(provider: string, amount: number): void;
  getSpend(provider: string): number;
  getTotalCost(): number;
  getRemaining(provider: string, scope: 'perTask' | 'perSession' | 'perDay'): number;
  estimateCost(inputTokens: number, outputTokens: number, provider: string): number;
  checkAlert(provider: string): 'ok' | 'warn' | 'throttle' | 'stop';
}

// =============================================================================
// AgentRegistry — agent lifecycle and capability queries
// =============================================================================

export interface AgentRegistry {
  registerAgent(config: {
    id: AgentId;
    name: string;
    role: string;
    model: string;
    provider: string;
    capabilities: string[];
    maxTokensPerTurn: number;
    costCapPerTask: number;
    costCapPerSession: number;
    costCapPerDay: number;
    maxParallelInstances: number;
    rateLimitRpm: number;
  }): void;
  updateStatus(agentId: AgentId, status: AgentStatus): void;
  getAgent(agentId: AgentId): {
    id: AgentId;
    name: string;
    role: string;
    model: string;
    provider: string;
    status: AgentStatus;
    capabilities: string[];
    totalRuns: number;
    successRate: number;
    consecutiveFailures: number;
  } | null;
  listAgents(): Array<{
    id: AgentId;
    name: string;
    role: string;
    status: AgentStatus;
    model: string;
    provider: string;
  }>;
  getAgentsByCapability(capability: string): AgentId[];
  getAgentsByRole(role: string): AgentId[];
  getHealthyAgents(): AgentId[];
  recordOutcome(agentId: AgentId, success: boolean): void;
}

// =============================================================================
// ModelSelector — provider-neutral model selection
// =============================================================================

export interface ModelSelector {
  selectForRole(role: string, requirements: {
    minTier?: string;
    requiredCapabilities?: string[];
    maxCostPerMillion?: number;
    preferLocal?: boolean;
  }): ModelCapability | null;
  getAvailableModels(): ModelCapability[];
  getModelHealth(modelId: string): ModelHealth | null;
  getModelRegistry(): {
    get(modelId: string): ModelCapability | null;
    getAll(): ModelCapability[];
    register(model: ModelCapability): void;
  } | null;
}

// =============================================================================
// ContextController — context building and management
// =============================================================================

export interface ContextController {
  buildContextPack(task: string, options?: {
    maxTokens?: number;
    useRecallService?: boolean;
  }): Promise<{
    content: string;
    files: string[];
    tokenEstimate: number;
  }>;
  registerAgent(agentId: AgentId, contextWindow: number): void;
  trackTokens(agentId: AgentId, inputTokens: number, outputTokens: number): {
    fillPercent: number;
    recommendedAction: 'none' | 'compact' | 'handoff' | 'emergency_handoff';
  };
  maskObservations(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }>;
  compact(messages: Array<{ role: string; content: string }>): {
    messages: Array<{ role: string; content: string }>;
    handoffDoc: Checkpoint;
  };
  createHandoff(fromAgentId: AgentId, reason: string): Checkpoint;
  validateHandoff(checkpoint: Checkpoint): {
    valid: boolean;
    checklist: {
      dataComplete: boolean;
      referencesGrounded: boolean;
      claimsVerified: boolean;
      capabilityMatch: boolean;
    };
    clarifications: string[];
  };
}

// =============================================================================
// ToolController — tool execution and permissioning
// =============================================================================

export interface ToolController {
  getAvailableTools(role?: string): string[];
  getToolPermission(toolName: string, args: Record<string, unknown>): ToolPermission;
  executeTool(call: ToolCall): Promise<ToolResult>;
  getToolCallHistory(): Array<ToolCall & { result: ToolResult }>;
  setToolExecutor(executor: {
    execute(toolName: string, args: Record<string, unknown>): Promise<{
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
      durationMs: number;
    }>;
  }): void;
}

// =============================================================================
// VerificationController — evidence and verification pipeline
// =============================================================================

export interface VerificationController {
  shouldVerify(strategy: string, complexity: Complexity, task: string): boolean;
  runVerification(task: string, agentOutputs: Array<{
    agentId: AgentId;
    role: string;
    output: string;
    patch?: string;
    testResults?: Record<string, unknown>;
  }>, options?: {
    parallel?: boolean;
    reviewerModel?: string;
    challengerModel?: string;
  }): Promise<EvidenceBundle>;
  finalize(runId: RunId, targetBefore: { mtime: number; size: number } | null): Promise<{
    status: 'done' | 'needs_user' | 'error';
    output: string;
    cost: number;
    agentCount: number;
  }>;
}

// =============================================================================
// CheckpointManager — durable state and recovery
// =============================================================================

export interface CheckpointManager {
  createCheckpoint(runId: RunId, reason: string, state: {
    objective: string;
    currentPlan: string;
    completedWork: string[];
    filesChanged: string[];
    commandsRun: string[];
    testResults: Record<string, unknown>;
    knownFailures: string[];
    openQuestions: string[];
    constraints: Record<string, unknown>;
    nextActions: string[];
    relevantContext: string[];
  }): CheckpointId;
  getCheckpoint(checkpointId: CheckpointId): Checkpoint | null;
  getLatestCheckpoint(runId: RunId): Checkpoint | null;
  restoreFromCheckpoint(checkpointId: CheckpointId): boolean;
  invalidateCheckpoints(runId: RunId): void;
}

// =============================================================================
// PolicyController — security and permission policy
// =============================================================================

export interface PolicyController {
  checkSecurity(input: string): {
    safe: boolean;
    confidence: number;
    flags: string[];
  };
  enforceRateLimit(tokens: number): Promise<void>;
  logSecurityEvent(event: string, confidence: number, flags: string[], details?: Record<string, unknown>): void;
  getPermissionDecision(action: string, context: Record<string, unknown>): ToolPermission;
  isConversationalTask(task: string): boolean;
}

// =============================================================================
// ArtifactManager — artifact and evidence storage
// =============================================================================

export interface ArtifactManager {
  storeArtifact(artifact: Omit<Artifact, 'id' | 'createdAt'>): Artifact;
  getArtifact(artifactId: string): Artifact | null;
  listArtifacts(runId: RunId): Artifact[];
  storeEvidence(evidence: Omit<Evidence, 'id' | 'timestamp'>): Evidence;
  getEvidenceBundle(runId: RunId): EvidenceBundle;
}
