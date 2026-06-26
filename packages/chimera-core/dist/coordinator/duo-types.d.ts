import type { LLMProvider } from '../session-orchestrator.js';
/**
 * Configuration for a duo-mode deliberation.
 *
 * Duo is a sequential verification mode:
 *   1. Model A generates a draft (Writer).
 *   2. Model B reviews Model A's draft and identifies issues (Reviewer).
 *   3. The outputs are merged via deterministic synthesis.
 *
 * Distinct from fusion and trio in two important ways:
 *   - There is **no judge / synthesizer LLM call**. The synthesis is
 *     free.
 *   - It is a 2-stage quality gate (Writer -> Reviewer).
 */
export interface DuoConfig {
    /** Primary peer model id (Writer). */
    modelA: string;
    /** Secondary peer model id (Reviewer). */
    modelB: string;
    /** If true, run a linter/check step between Writer and Reviewer. */
    useLinter?: boolean;
    /** Sampling temperature forwarded to both model calls. 0–2. */
    temperature?: number;
    /** Max output tokens (including reasoning) per model call. */
    maxCompletionTokens?: number;
    /** Reasoning config forwarded to model calls. */
    reasoning?: {
        effort?: 'low' | 'medium' | 'high';
        maxTokens?: number;
    };
    /** Per-task budget in USD. Triggers degraded result when exceeded. */
    budgetUsd?: number;
    /** Maximum recursion depth. Default 1. */
    maxDepth?: number;
    /** Force the executor to run even when the request looks simple. */
    forceInvocation?: boolean;
}
/**
 * Context carried through recursive duo calls. The top-level caller
 * passes `depth: 0`; nested calls increment.
 */
export interface DuoContext {
    depth: number;
}
/**
 * One model's output. The merged `DuoResult.analysis` is built from
 * both of these via the deterministic `ResponseSynthesizer`.
 */
export interface DuoSource {
    modelId: string;
    role: 'writer' | 'reviewer';
    content: string;
    /** Total tokens for this source (input + output). */
    tokens: number;
    durationMs: number;
    error?: string;
}
/**
 * 5-field structured analysis (matches fusion and trio's contract so
 * downstream consumers can treat all 3 modes uniformly).
 */
export interface DuoAnalysis {
    thought: string;
    finalResponse: string;
    consensus: string[];
    conflicts: string[];
    uniqueInsights: string[];
    blindSpots: string[];
    confidence: number;
}
export interface DuoResult {
    output: string;
    analysis: DuoAnalysis;
    sources: DuoSource[];
    totalTokens: number;
    totalCostUsd: number;
    durationMs: number;
    degraded: boolean;
    degradationReason?: string;
    /** True when the synthesizer detected a contradiction that needs a human. */
    needsUserEscalation: boolean;
    escalationReason?: string;
}
export type DuoProviderFactory = (modelId: string) => LLMProvider;
//# sourceMappingURL=duo-types.d.ts.map