// @chimera/core — Core orchestrator, event stream, and agent mesh coordination

export { zodToJsonSchema } from './zod-json.js';
export { EventStream } from './event-stream.js';
export { AgentMesh } from './agent-mesh.js';
export { TaskRouter } from './task-router.js';
export { CostTracker } from './cost-tracker.js';
export { SessionOrchestrator } from './session-orchestrator.js';
export { ResponseSynthesizer } from './response-synthesizer.js';
export { AGENT_PROMPTS, MODE_INSTRUCTIONS, RECOVERY_PROMPTS, buildMessages, buildWorkflowGeneratorPrompt, COMPACT_CORE_IDENTITY, SMALL_MODEL_GUIDANCE, compactAgentPrompt } from './prompts.js';
export { bootstrap } from './bootstrap.js';
export type { BootstrapResult } from './bootstrap.js';

// Memory
export { LongTermMemory, VectorStore, LocalEmbeddingProvider, AgentMemory, MemoryPersistence } from './memory/index.js';
export type { LongTermMemoryConfig, MemoryPersistenceConfig } from './memory/index.js';
export type { MemoryItem, MemoryMetadata, MemoryQuery, MemoryResult, EmbeddingProvider } from './memory/index.js';
export type { AgentMemoryItem, AgentMemoryType, AgentMemoryQuery, AgentMemorySnapshot } from './memory/index.js';

// Coordinator
export { CoordinatorEngine, TaskDecomposer, SubAgentSpawner, ResultAggregator } from './coordinator/index.js';
export type { SubTask, SubTaskResult, DecompositionResult, AggregatedResult, Conflict, CoordinatorConfig } from './coordinator/index.js';
export { DeliberationEngine } from './coordinator/deliberation/index.js';
export type { DeliberationResult, DeliberationConfig } from './coordinator/deliberation/index.js';
export type { DeliberationMode, UserPreset } from './coordinator/deliberation/types.js';
export { BiomeLinter } from './coordinator/biome-linter.js';
export type { BiomeLinterConfig } from './coordinator/biome-linter.js';

// Cross-vendor review enforcement
export {
  extractVendor,
  areSameVendor,
  findCrossVendorReviewer,
  assignCrossVendorProviders,
  validateCrossVendorReview,
} from './coordinator/cross-vendor-review.js';

// Purpose guard — every sub-agent must declare purpose
export {
  validatePurpose,
  getAllowedToolsForPurpose,
  getRecommendedTierForPurpose,
  ALLOWED_PURPOSES,
} from './coordinator/purpose-guard.js';
export type { SubAgentPurpose, PurposeGuardResult } from './coordinator/purpose-guard.js';

// Worktree Isolation
export { WorktreeIsolation } from './agent/worktree-isolation.js';
export type { WorktreeInfo } from './agent/worktree-isolation.js';

// Agent YAML — Declarative agent definitions
export { AgentYamlSchema, validateAgentYaml, safeValidateAgentYaml } from './agent/agent-schema.js';
export type { AgentYaml, FunctionTool, McpTool, AgentTool, ToolDefinition, ExecutorConfig } from './agent/agent-schema.js';
export { loadAgentFile, loadAgentsFromDir, discoverAgents, findAgentByName, filterAgentsByRole } from './agent/agent-loader.js';
export type { AgentLoadError, AgentLoadResult } from './agent/agent-loader.js';

// Harness registry — run agents across multiple backends
export { HarnessRegistry, createDefaultHarnessRegistry } from './agent/harness-registry.js';
export type { HarnessType, HarnessRegistration, HarnessConfig } from './agent/harness-registry.js';

// Security
export { checkUserInput, checkToolOutput, sanitizeForPrompt, AuditLog, SecretDetector, SECRET_PATTERNS } from './security/index.js';
export type { InjectionCheck, InjectionFlag, AuditEntry, AuditQuery, SecretMatch } from './security/index.js';

// Workflow
export { WorkflowRegistry, WorkflowAutoLoader, WorkflowLoader, WorkflowDispatcher, runWorkflow, registerBuiltInWorkflows, defaultWorkflowFor, runLoopStep, detectCompletionSignal } from './workflow/index.js';
export type { WorkflowDefinition, WorkflowStep, WorkflowContext, WorkflowRunResult, WorkflowRunStatus, WorkflowStepKind } from './workflow/types.js';
export type { DispatchOptions, DispatchResult, WorkflowDispatcherOptions } from './workflow/dispatcher.js';

// Skills
export { listAllSkills, loadSkill, loadSkillsForMode, parseSkillFile, buildInputsSchema, _resetLegacyWarnings } from './skills/skill-loader.js';
export type { LoadedSkill, SkillRecord, SkillSource, LoadOptions } from './skills/skill-loader.js';
export { SKILL_BUNDLES } from './skills/skill-bundles.js';
export { parseSkillPack } from './skills/skill-pack.js';
export type { SkillPack } from './skills/skill-pack.js';

// Side-query
export { sideQuery, setSideQueryChannel, SIDEQUERY_NO_LEAK_MARKER, fingerprintPayload } from './side-query.js';
export type { SideQueryProvider, SideQueryOptions, SideQueryResult, SideQueryChannel } from './side-query.js';

// Output styles
export { loadOutputStyles, getOutputStyle, buildStylePrompt } from './output-styles/index.js';
export type { OutputStyle } from './output-styles/index.js';

// Types
export type { PromptTemplate, OutputSchema, BuildMessagesParams } from './prompts.js';
export type { LLMProvider, AgentOutput, OrchestratorResult, ToolExecutorInterface, ToolRegistryInterface } from './session-orchestrator.js';
export type { ChimeraEvent } from './types/events.js';
export type { AgentRole, Mode, PermissionDecision, ToolCall, ToolCallResult } from './types/agent.js';
export type { HandoffDocument, HandoffChecklist, HandoffDelta } from './types/handoff.js';
export type { ComplexityScore } from './types/router.js';
