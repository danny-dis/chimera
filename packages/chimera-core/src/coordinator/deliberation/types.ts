/**
 * Types for the unified `DeliberationEngine`.
 *
 * Chimera historically had 5 separate deliberation systems (Solo, Duo,
 * Trio, Fusion, Merge). This module defines a single config + result
 * surface that all 5 modes are exposed through. The engine itself lives
 * in `./engine.ts`; the underlying executors (`SoloExecutor`,
 * `DuoExecutor`, `TrioExecutor`, `ResultAggregator`) remain the
 * internal implementations — the engine is a thin facade that
 * dispatches on `config.mode` and normalizes each result to the same
 * 5-field `DeliberationResult` shape.
 *
 * Design notes (mirroring `research/deliberation-engine-design.md`):
 *   - The `DeliberationConfig` is a discriminated union on `mode`. All
 *     modes share `DeliberationConfigBase` so callers can write generic
 *     dispatch code without downcasting.
 *   - The `DeliberationResult` is identical for every mode. Modes that
 *     don't have a particular field (e.g. solo has no consensus) get an
 *     empty array / 0 confidence — never undefined.
 *   - The engine is **additive** to the existing executors. The old
 *     call sites (e.g. `AgentMesh.executeQualityGate` → `TrioExecutor`)
 *     keep working unchanged.
 */

import type { EventStream } from '../../event-stream.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../../cost-tracker.js';
import type { SubTaskResult, ModelPool } from '../types.js';

/** The 8 deliberation modes. */
export type DeliberationMode = 'solo' | 'duo' | 'trio' | 'fusion' | 'merge' | 'hive' | 'swarm' | 'auto';

/** User-selectable presets. Excludes internal-only modes (merge). */
export type UserPreset = 'auto' | 'solo' | 'duo' | 'trio' | 'hive' | 'fusion' | 'swarm';

/** Provider factory — `(modelId) => LLMProvider`. */
export type DeliberationProviderFactory = (
  modelId: string,
) => import('../../session-orchestrator.js').LLMProvider;

/** Shared config knobs across all modes. */
export interface DeliberationConfigBase {
  /** The task to deliberate on. */
  task: string;
  /** Optional context (e.g. file contents, history). */
  context?: string;
  /** LLM sampling temperature. */
  temperature?: number;
  /** Max output tokens per call. */
  maxCompletionTokens?: number;
  /** Hard cap on USD spend. */
  budgetUsd?: number;
  /** Max recursion depth. Default 1. */
  maxDepth?: number;
  /** Reasoning config (passed through to provider). */
  reasoning?: Record<string, unknown>;
}

export interface SoloDeliberationConfig extends DeliberationConfigBase {
  mode: 'solo';
  model: string;
  /** If true, always run the thinker step before writing. */
  eternalCoT?: boolean;
  /** If false, skip self-verification (default true). */
  selfVerify?: boolean;
}

export interface DuoDeliberationConfig extends DeliberationConfigBase {
  mode: 'duo';
  modelA: string;
  modelB: string;
}

export interface TrioDeliberationConfig extends DeliberationConfigBase {
  mode: 'trio';
  writer: string;
  reviewer: string;
  challenger?: string;
  /** Optional LLM synthesizer (else deterministic). */
  synthesizer?: string;
  /** If true, run the draft in a worktree. */
  isolateWorktree?: boolean;
  /**
   * Run reviewer and challenger in parallel instead of sequentially.
   * Default: true.
   */
  parallel?: boolean;
}

export interface FusionDeliberationConfig extends DeliberationConfigBase {
  mode: 'fusion';
  analysisModels: string[];
  judgeModel: string;
  judgeFailover?: string[];
  /** Number of inner panel calls per question. */
  panelSize?: number;
  /** If true, prioritize local models for auto-selection. */
  preferLocal?: boolean;
  /** If true, run a second deliberation round. */
  adversarialRound?: boolean;
  /** If true, inject diverse viewpoints into panel members. */
  diversePerspectives?: boolean;
}

export interface MergeDeliberationConfig extends DeliberationConfigBase {
  mode: 'merge';
  /** Sub-task results to merge. */
  subTaskResults: SubTaskResult[];
  /** Model to use as the merge judge. */
  mergeModel: string;
}

export interface HiveDeliberationConfig extends DeliberationConfigBase {
  mode: 'hive';
  /** Models to assign to subtasks. Each subtask gets a different model. */
  models: string[];
  /** Optional: max subtasks to decompose into. */
  maxSubTasks?: number;
  /** Optional: merge model (defaults to first model). */
  mergeModel?: string;
  /**
   * Optional: Model pool for capability-based routing.
   * When provided, subtasks are routed to the best model based on type
   * instead of round-robin assignment.
   */
  modelPool?: ModelPool;
}

export interface AutoDeliberationConfig extends DeliberationConfigBase {
  mode: 'auto';
  /** Optional: constrain which presets are eligible for auto-selection. */
  eligiblePresets?: DeliberationMode[];
}

export interface SwarmDeliberationConfig extends DeliberationConfigBase {
  mode: 'swarm';
  /** Max agents in the swarm. Default 50. */
  maxAgents?: number;
  /** Max concurrent agents. Default 10. */
  maxConcurrency?: number;
  /** Cluster size for hierarchical aggregation. Default 15. */
  clusterSize?: number;
  /** Delay between agent launches in ms. Default 50. */
  staggerDelayMs?: number;
}

export type DeliberationConfig =
  | SoloDeliberationConfig
  | DuoDeliberationConfig
  | TrioDeliberationConfig
  | FusionDeliberationConfig
  | MergeDeliberationConfig
  | HiveDeliberationConfig
  | SwarmDeliberationConfig
  | AutoDeliberationConfig;

/** The 5-field analysis shape. Uniform across all modes. */
export interface DeliberationAnalysis {
  thought: string;
  finalResponse: string;
  consensus: string[];
  conflicts: string[];
  uniqueInsights: string[];
  blindSpots: string[];
  confidence: number;
}

export interface DeliberationResult {
  mode: DeliberationMode;
  output: string;
  analysis: DeliberationAnalysis;
  totalTokens: number;
  totalCostUsd: number;
  durationMs: number;
  degraded: boolean;
  degradationReason?: string;
  /** Present when mode === 'auto'. Records which preset was selected and why. */
  autoSelection?: {
    selectedPreset: DeliberationMode;
    complexity: number;
    reason: string;
  };
}

export interface DeliberationEngineDeps {
  eventStream: EventStream;
  registry: ModelRegistry;
  costTracker?: CostTracker;
  worktreeIsolation?: import('../../agent/worktree-isolation.js').WorktreeIsolation;
  /** Provider factory — injected for testability. */
  providerFactory: DeliberationProviderFactory;
  /** Optional list of available provider IDs (used by auto mode for preset selection). */
  availableProviders?: string[];
  /** Optional task router for complexity estimation in auto mode. */
  taskRouter?: import('../../task-router.js').TaskRouter;
  /** Optional recursion context — internal use. */
  context?: { depth?: number };
  /**
   * Tool executor + registry. When provided, the deliberation executors
   * (solo/trio writer) become tool-capable: tool calls emitted by the LLM
   * are executed against the workspace instead of being ignored.
   */
  workspaceRoot?: string;
  toolExecutor?: import('../../session-orchestrator.js').ToolExecutorInterface;
  toolRegistry?: import('../../session-orchestrator.js').ToolRegistryInterface;
}
