// @chimera/domain — Canonical domain types for Chimera coding agent

// ID types
export {
  SessionIdSchema,
  RunIdSchema,
  TaskIdSchema,
  MissionIdSchema,
  AgentIdSchema,
  CheckpointIdSchema,
} from './types.js';
export type {
  SessionId,
  RunId,
  TaskId,
  MissionId,
  AgentId,
  CheckpointId,
} from './types.js';

// Session
export { SessionStatusSchema, SessionConfigSchema } from './types.js';
export type { SessionStatus, SessionConfig, Session } from './types.js';

// Run
export { RunStatusSchema, RunResultSchema } from './types.js';
export type { RunStatus, RunResult, Run } from './types.js';

// Task
export { TaskTypeSchema, TaskStatusSchema, ComplexitySchema, TaskSchema } from './types.js';
export type { TaskType, TaskStatus, Complexity, Task } from './types.js';

// Mission
export { MissionStatusSchema } from './types.js';
export type { MissionStatus, Mission } from './types.js';

// Agent
export { AgentRoleSchema, AgentStatusSchema, AgentCapabilitySchema } from './types.js';
export type { AgentRole, AgentStatus, AgentCapability, AgentDefinition } from './types.js';

// Model
export { ModelTierSchema, ModelCapabilitySchema, ModelHealthSchema } from './types.js';
export type { ModelTier, ModelCapability, ModelHealth } from './types.js';

// Tool
export { ToolPermissionSchema, ToolCategorySchema } from './types.js';
export type { ToolPermission, ToolCategory, ToolDefinition, ToolCall, ToolResult } from './types.js';

// Artifact
export { ArtifactTypeSchema } from './types.js';
export type { ArtifactType, Artifact } from './types.js';

// Evidence
export { EvidenceTypeSchema, EvidenceSeveritySchema } from './types.js';
export type { EvidenceType, EvidenceSeverity, Evidence, EvidenceBundle } from './types.js';

// Checkpoint
export { CheckpointReasonSchema } from './types.js';
export type { CheckpointReason, Checkpoint } from './types.js';

// Domain Events
export { DomainEventTypeSchema } from './types.js';
export type { DomainEventType, DomainEvent } from './types.js';

// Service interfaces
export type {
  EventBus,
  SessionStateStore,
  RunController,
  BudgetController,
  AgentRegistry,
  ModelSelector,
  ContextController,
  ToolController,
  VerificationController,
  CheckpointManager,
  PolicyController,
  ArtifactManager,
} from './interfaces.js';
