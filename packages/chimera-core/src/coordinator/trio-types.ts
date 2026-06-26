import type { LLMProvider } from '../session-orchestrator.js';

/**
 * Configuration for a trio-mode deliberation. The trio is the
 * "writer → reviewer → challenger → synthesize" quality gate.
 *
 * Distinct from fusion in two important ways:
 *   - The synthesizer is OPTIONAL. Without one, the deterministic
 *     `ResponseSynthesizer` (Jaccard + role authority) is used. This
 *     keeps trio cheap — no extra LLM call beyond the 3 (or 2) stage
 *     calls. The deterministic path is fast, free, and good enough for
 *     most quality-gate use cases.
 *   - The draft stage can be wrapped in a `WorktreeIsolation` worktree
 *     via `isolateWorktree: true`. Off by default because the worktree
 *     adds latency (clone, commit, merge) and is only useful for code
 *     work.
 */
export interface TrioConfig {
  /** Writer model id (drafts the answer). */
  writer: string;
  /** Reviewer model id (verifies the draft, raises issues). */
  reviewer: string;
  /** Challenger model id (optional — if omitted, the 3rd stage is skipped). */
  challenger?: string;
  /** If true, run a linter/check step after the draft. */
  useLinter?: boolean;
  /**
   * Optional LLM synthesizer model id. If provided, runs a 5-field
   * structured analysis on the stage outputs (like fusion's judge).
   * If omitted, falls back to the deterministic `ResponseSynthesizer`.
   */
  synthesizer?: string;
  /** Fallback synthesizer models tried in order if the primary fails. */
  synthesizerFailover?: string[];
  /** Sampling temperature forwarded to every stage call. 0–2. */
  temperature?: number;
  /** Max output tokens (including reasoning) per stage call. */
  maxCompletionTokens?: number;
  /** Reasoning config forwarded to stage calls. */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number };
  /** Per-task budget in USD. Triggers degraded result when exceeded. */
  budgetUsd?: number;
  /** Maximum recursion depth. Default 1. */
  maxDepth?: number;
  /** Wrap the draft stage in a WorktreeIsolation worktree. Off by default. */
  isolateWorktree?: boolean;
  /**
   * Run reviewer and challenger in parallel instead of sequentially.
   * When true, the challenger receives only the draft (not the review).
   * Falls back to sequential if parallel execution fails.
   * Default: true.
   */
  parallel?: boolean;
  /** Force the executor to run even when the request looks simple. */
  forceInvocation?: boolean;
  /**
   * Mode for prompt composition. Controls which role-specific mandates
   * and output formatting rules are applied. Defaults to 'code'.
   */
  mode?: 'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal' | 'auto';
  /**
   * Maximum revision iterations after a "needs_revision" verdict.
   * 0 = no revision (current behavior). Default: 0.
   */
  maxRevisions?: number;
  /**
   * Severity threshold for triggering revision. Only issues at or above
   * this severity trigger a re-draft. Default: 'high'.
   */
  revisionSeverityThreshold?: 'high' | 'med' | 'low';
}

/**
 * Context carried through recursive trio calls. The top-level caller
 * passes `depth: 0`; nested calls increment.
 */
export interface TrioContext {
  depth: number;
}

/** One stage's output. */
export interface TrioStageResult {
  modelId: string;
  role: 'writer' | 'reviewer' | 'challenger' | 'synthesizer';
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Issues raised by the reviewer. */
  issues?: Array<{ description: string; severity: string; evidence: string }>;
  /** Challenges raised by the challenger. */
  challenges?: string[];
  error?: string;
}

/**
 * 5-field structured analysis (matches fusion's contract so downstream
 * consumers can treat all 5 modes uniformly).
 */
export interface TrioAnalysis {
  thought: string;
  finalResponse: string;
  consensus: string[];
  conflicts: string[];
  uniqueInsights: string[];
  blindSpots: string[];
  confidence: number;
}

export interface TrioResult {
  output: string;
  analysis: Partial<TrioAnalysis>;
  stages: TrioStageResult[];
  totalTokens: number;
  totalCostUsd: number;
  durationMs: number;
  degraded: boolean;
  degradationReason?: string;
  /** Path to the worktree if `isolateWorktree: true` and it was created. */
  worktreePath?: string;
  /** True when the synthesizer detected a contradiction that needs a human. */
  needsUserEscalation: boolean;
  escalationReason?: string;
}

export type TrioProviderFactory = (modelId: string) => LLMProvider;
