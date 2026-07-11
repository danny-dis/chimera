import type { LLMProvider } from '../session-orchestrator.js';

/** Subtask type classification for capability-based model routing. */
export type SubTaskType =
  | 'code_generation'
  | 'code_review'
  | 'reasoning'
  | 'analysis'
  | 'research'
  | 'summarization'
  | 'general';

/** Model capability metadata inferred from model ID or registry. */
export interface ModelCapability {
  modelId: string;
  tier: 'cheap' | 'mid' | 'frontier' | 'reasoning';
  specialties: SubTaskType[];
  costPerMillionInput: number;
  costPerMillionOutput: number;
}

/** Pool of available models with their capabilities for routing decisions. */
export interface ModelPool {
  models: ModelCapability[];
  preferFrontierForJudge?: boolean;
}

export interface SubTask {
  id: string;
  description: string;
  dependencies: string[]; // ids of sub-tasks that must complete first
  context: string; // relevant context for this sub-task
  provider: LLMProvider;
  estimatedTokens: number;
  /** Optional type classification for capability-based model routing. */
  type?: SubTaskType;
  /** Optional priority for ordering. */
  priority?: number;
  /**
   * Optional tool definitions (OpenAI-style) for file-writing sub-tasks.
   * When present, the spawner passes them to the sub-agent and executes any
   * tool_calls it emits (write_file/edit_file) on the workspace, so hive
   * sub-agents can land real files instead of narrating code as text.
   */
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export interface SubTaskResult {
  subTaskId: string;
  status: 'success' | 'error' | 'timeout';
  output: string;
  tokensUsed: number;
  error?: string;
  durationMs: number;
  assignedModel?: string;
}

export interface DecompositionResult {
  subTasks: SubTask[];
  strategy: 'parallel' | 'sequential' | 'mixed';
  rationale: string;
}

export interface AggregatedResult {
  output: string;
  conflicts: Conflict[];
  resolved: boolean;
  subTaskResults: SubTaskResult[];
  totalTokens: number;
}

export interface Conflict {
  subTaskIds: string[];
  type: 'contradiction' | 'overlap' | 'gap';
  description: string;
  resolution?: string;
}

export interface CoordinatorConfig {
  maxConcurrency: number;
  taskTimeoutMs: number;
  conflictResolution: 'auto' | 'escalate';
  staggerDelayMs?: number;
}
