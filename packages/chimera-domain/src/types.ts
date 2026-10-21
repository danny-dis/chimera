import { z } from 'zod';

// =============================================================================
// ID Types — stable, unique, serializable
// =============================================================================

export const SessionIdSchema = z.string().uuid().or(z.string().min(1));
export type SessionId = z.infer<typeof SessionIdSchema>;

export const RunIdSchema = z.string().uuid().or(z.string().min(1));
export type RunId = z.infer<typeof RunIdSchema>;

export const TaskIdSchema = z.string().uuid().or(z.string().min(1));
export type TaskId = z.infer<typeof TaskIdSchema>;

export const MissionIdSchema = z.string().uuid().or(z.string().min(1));
export type MissionId = z.infer<typeof MissionIdSchema>;

export const AgentIdSchema = z.string().min(1);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const CheckpointIdSchema = z.string().uuid().or(z.string().min(1));
export type CheckpointId = z.infer<typeof CheckpointIdSchema>;

// =============================================================================
// Session — the user's continuous coding interaction
// =============================================================================

export const SessionStatusSchema = z.enum([
  'initializing',
  'active',
  'paused',
  'completing',
  'completed',
  'failed',
  'cancelled',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionConfigSchema = z.object({
  modelOverrides: z.record(z.string()).optional(),
  strategyOverride: z.string().optional(),
  budgetUsd: z.number().positive().optional(),
  timeoutMs: z.number().positive().optional(),
  workspaceRoot: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface Session {
  id: SessionId;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  config: SessionConfig;
  activeRunId: RunId | null;
  runIds: RunId[];
  missionIds: MissionId[];
}

// =============================================================================
// Run — one execution attempt inside a session
// =============================================================================

export const RunStatusSchema = z.enum([
  'pending',
  'planning',
  'executing',
  'verifying',
  'repairing',
  'completed',
  'failed',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunResultSchema = z.object({
  success: z.boolean(),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  testsPassed: z.number().optional(),
  testsFailed: z.number().optional(),
  costUsd: z.number().optional(),
  durationMs: z.number(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export interface Run {
  id: RunId;
  sessionId: SessionId;
  status: RunStatus;
  strategy: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  taskIds: TaskId[];
  agentIds: AgentId[];
  result: RunResult | null;
  costUsd: number;
  tokenCount: number;
  checkpointId: CheckpointId | null;
}

// =============================================================================
// Task — a bounded unit of coding work
// =============================================================================

export const TaskTypeSchema = z.enum([
  'code_generation',
  'code_review',
  'reasoning',
  'analysis',
  'research',
  'summarization',
  'debugging',
  'testing',
  'refactoring',
  'general',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'assigned',
  'in_progress',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ComplexitySchema = z.object({
  overall: z.number().min(0).max(1),
  dimensions: z.object({
    codeVolume: z.number().min(0).max(1),
    architecturalDepth: z.number().min(0).max(1),
    dependencyComplexity: z.number().min(0).max(1),
    testCoverage: z.number().min(0).max(1),
    securitySensitivity: z.number().min(0).max(1),
    domainNovelty: z.number().min(0).max(1),
    errorHandling: z.number().min(0).max(1),
    concurrency: z.number().min(0).max(1),
    externalIntegrations: z.number().min(0).max(1),
    dataTransformation: z.number().min(0).max(1),
    stateManagement: z.number().min(0).max(1),
    algorithmicComplexity: z.number().min(0).max(1),
    apiDesign: z.number().min(0).max(1),
    refactoringScope: z.number().min(0).max(1),
    crossCuttingConcerns: z.number().min(0).max(1),
  }),
});
export type Complexity = z.infer<typeof ComplexitySchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  description: z.string().min(1),
  type: TaskTypeSchema.optional(),
  status: TaskStatusSchema.optional(),
  complexity: ComplexitySchema.optional(),
  dependencies: z.array(TaskIdSchema).optional(),
  assignedAgent: AgentIdSchema.optional(),
  estimatedTokens: z.number().positive().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// =============================================================================
// Mission — a durable higher-level objective
// =============================================================================

export const MissionStatusSchema = z.enum([
  'draft',
  'active',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export interface Mission {
  id: MissionId;
  sessionId: SessionId;
  title: string;
  description: string;
  status: MissionStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  taskIds: TaskId[];
  constraints: {
    budgetUsd?: number;
    deadline?: number;
    requiredCapabilities?: string[];
  };
  result: {
    success: boolean;
    summary: string;
  } | null;
}

// =============================================================================
// Agent — a named execution persona
// =============================================================================

export const AgentRoleSchema = z.enum([
  'planner',
  'explorer',
  'implementer',
  'debugger',
  'tester',
  'reviewer',
  'security-reviewer',
  'synthesizer',
  'researcher',
  'summarizer',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentStatusSchema = z.enum([
  'registered',
  'starting',
  'ready',
  'running',
  'paused',
  'failed',
  'recovering',
  'stopped',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentCapabilitySchema = z.object({
  role: AgentRoleSchema,
  tools: z.array(z.string()),
  maxTokensPerTurn: z.number().positive(),
  costCapPerTask: z.number().nonnegative(),
  costCapPerSession: z.number().nonnegative(),
  costCapPerDay: z.number().nonnegative(),
  maxParallelInstances: z.number().positive(),
  rateLimitRpm: z.number().positive(),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export interface AgentDefinition {
  id: AgentId;
  name: string;
  version: string;
  description: string;
  capabilities: AgentCapability;
  modelPreferences: {
    primary: string;
    fallbacks: string[];
  };
  status: AgentStatus;
  health: {
    lastHeartbeat: number;
    consecutiveFailures: number;
    totalRuns: number;
    successRate: number;
  };
  metadata: Record<string, unknown>;
}

// =============================================================================
// Model — an inference resource
// =============================================================================

export const ModelTierSchema = z.enum(['cheap', 'mid', 'frontier', 'reasoning', 'local']);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const ModelCapabilitySchema = z.object({
  modelId: z.string(),
  provider: z.string(),
  tier: ModelTierSchema,
  contextWindow: z.number().positive(),
  modalities: z.array(z.enum(['text', 'image', 'audio', 'video'])),
  toolSupport: z.boolean(),
  structuredOutput: z.boolean(),
  streaming: z.boolean(),
  reasoning: z.boolean(),
  costPerMillionInput: z.number().nonnegative(),
  costPerMillionOutput: z.number().nonnegative(),
  specialties: z.array(TaskTypeSchema),
});
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelHealthSchema = z.object({
  modelId: z.string(),
  provider: z.string(),
  available: z.boolean(),
  latencyP50Ms: z.number().nonnegative(),
  latencyP95Ms: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  rateLimitRemaining: z.number().nonnegative().optional(),
  lastChecked: z.number(),
});
export type ModelHealth = z.infer<typeof ModelHealthSchema>;

// =============================================================================
// Tool — a deterministic or external operation
// =============================================================================

export const ToolPermissionSchema = z.enum(['allow', 'ask', 'deny', 'escalate']);
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

export const ToolCategorySchema = z.enum([
  'filesystem',
  'shell',
  'git',
  'network',
  'lsp',
  'mcp',
  'browser',
  'internal',
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, unknown>;
  requiredPermissions: string[];
  timeoutMs: number;
  idempotent: boolean;
}

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  agentId: AgentId;
  runId: RunId;
  timestamp: number;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  permission: ToolPermission;
}

// =============================================================================
// Artifact — produced state
// =============================================================================

export const ArtifactTypeSchema = z.enum([
  'file',
  'patch',
  'log',
  'test_report',
  'plan',
  'screenshot',
  'diff',
  'other',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export interface Artifact {
  id: string;
  runId: RunId;
  agentId: AgentId;
  type: ArtifactType;
  path: string;
  contentHash: string;
  sizeBytes: number;
  createdAt: number;
  metadata: Record<string, unknown>;
}

// =============================================================================
// Evidence — structured proof supporting a result
// =============================================================================

export const EvidenceTypeSchema = z.enum([
  'test_result',
  'typecheck',
  'lint',
  'build',
  'security_scan',
  'review_finding',
  'tool_output',
  'compiler_output',
  'provenance',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type EvidenceSeverity = z.infer<typeof EvidenceSeveritySchema>;

export interface Evidence {
  id: string;
  runId: RunId;
  agentId: AgentId;
  type: EvidenceType;
  verdict: 'pass' | 'fail' | 'needs_revision';
  description: string;
  severity: EvidenceSeverity;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface EvidenceBundle {
  runId: RunId;
  evidences: Evidence[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    needsRevision: number;
  };
  generatedAt: number;
}

// =============================================================================
// Checkpoint — recoverable state
// =============================================================================

export const CheckpointReasonSchema = z.enum([
  'manual',
  'auto',
  'handoff',
  'context_threshold',
  'task_boundary',
  'crash_recovery',
]);
export type CheckpointReason = z.infer<typeof CheckpointReasonSchema>;

export interface Checkpoint {
  id: CheckpointId;
  runId: RunId;
  sessionId: SessionId;
  reason: CheckpointReason;
  createdAt: number;
  state: {
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
  };
  tokenCount: number;
  valid: boolean;
}

// =============================================================================
// Domain Events — state change notifications
// =============================================================================

export const DomainEventTypeSchema = z.enum([
  'session_created',
  'session_status_changed',
  'run_started',
  'run_status_changed',
  'run_completed',
  'task_created',
  'task_status_changed',
  'task_assigned',
  'mission_created',
  'mission_status_changed',
  'agent_registered',
  'agent_status_changed',
  'checkpoint_created',
  'evidence_produced',
  'artifact_created',
]);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export interface DomainEvent {
  type: DomainEventType;
  sessionId: SessionId;
  runId?: RunId;
  taskId?: TaskId;
  agentId?: AgentId;
  payload: Record<string, unknown>;
  timestamp: number;
}
