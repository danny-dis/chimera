// @chimera/core — Core orchestrator, event stream, and agent mesh coordination

export { EventStream } from './event-stream.js';
export { AgentMesh } from './agent-mesh.js';
export { TaskRouter } from './task-router.js';
export { CostTracker } from './cost-tracker.js';
export { SessionOrchestrator } from './session-orchestrator.js';
export { ResponseSynthesizer } from './response-synthesizer.js';
export { AGENT_PROMPTS, MODE_INSTRUCTIONS, RECOVERY_PROMPTS, buildMessages } from './prompts.js';

// Memory
export { LongTermMemory, VectorStore, LocalEmbeddingProvider, AgentMemory } from './memory/index.js';
export type { LongTermMemoryConfig } from './memory/index.js';
export type { MemoryItem, MemoryMetadata, MemoryQuery, MemoryResult, EmbeddingProvider } from './memory/index.js';
export type { AgentMemoryItem, AgentMemoryType, AgentMemoryQuery, AgentMemorySnapshot } from './memory/index.js';

// Coordinator
export { CoordinatorEngine, TaskDecomposer, SubAgentSpawner, ResultAggregator } from './coordinator/index.js';
export type { SubTask, SubTaskResult, DecompositionResult, AggregatedResult, Conflict, CoordinatorConfig } from './coordinator/index.js';

// Worktree Isolation
export { WorktreeIsolation } from './agent/worktree-isolation.js';
export type { WorktreeInfo } from './agent/worktree-isolation.js';

// Security
export { checkUserInput, checkToolOutput, sanitizeForPrompt, AuditLog } from './security/index.js';
export type { InjectionCheck, InjectionFlag, AuditEntry, AuditQuery } from './security/index.js';

// Types
export type { PromptTemplate, OutputSchema, BuildMessagesParams } from './prompts.js';
export type { LLMProvider, AgentOutput, OrchestratorResult, ToolExecutorInterface, ToolRegistryInterface } from './session-orchestrator.js';
export type { ChimeraEvent } from './types/events.js';
export type { AgentRole, Mode, PermissionDecision, ToolCall, ToolCallResult } from './types/agent.js';
export type { HandoffDocument, HandoffChecklist, HandoffDelta } from './types/handoff.js';
export type { ComplexityScore } from './types/router.js';
