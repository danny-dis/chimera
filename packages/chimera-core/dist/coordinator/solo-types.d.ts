import type { LLMProvider } from '../session-orchestrator.js';
/**
 * Configuration for solo-mode execution.
 *
 * Solo has two sub-modes:
 *   1. Direct (selfVerify=false): One model answers one prompt.
 *   2. Self-Correction (selfVerify=true, default): The model writes a
 *      draft, then is prompted to review and improve its own work.
 *
 * It still gets the full fusion safety net (recursion guard, budget
 * enforcement, degraded fallback, structured 5-field analysis).
 */
export interface SoloConfig {
    /** Model identifier (resolved via the ModelRegistry). */
    model: string;
    /**
     * If true (default), the model will perform a self-correction turn.
     * Writer -> same model as Reviewer -> Synthesize.
     */
    selfVerify?: boolean;
    /**
     * If true, the model will perform an explicit "thinking" turn before
     * generating the answer (Eternal CoT).
     */
    eternalCoT?: boolean;
    /** Sampling temperature forwarded to the inner call. 0–2. */
    temperature?: number;
    /** Max output tokens (including reasoning) for the inner call. */
    maxCompletionTokens?: number;
    /** Reasoning config forwarded to the call. */
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
 * Context carried through recursive solo calls. The top-level caller
 * passes `depth: 0`; nested calls increment.
 */
export interface SoloContext {
    depth: number;
}
/**
 * 5-field structured analysis (matches fusion/trio's contract so
 * downstream consumers can treat all modes uniformly). For solo, the
 * consensus / conflicts / uniqueInsights / blindSpots fields are
 * always empty arrays — there's only one perspective, so there can be
 * no agreement, disagreement, unique contributions, or gaps relative
 * to other models. `finalResponse` is the model's output verbatim.
 */
export interface SoloAnalysis {
    thought: string;
    finalResponse: string;
    consensus: string[];
    conflicts: string[];
    uniqueInsights: string[];
    blindSpots: string[];
    confidence: number;
}
/**
 * Result of a solo execution. The `degraded` flag is true when the
 * executor fell back to a non-solo path (e.g. provider threw, recursion
 * limit reached, budget exceeded, config invalid).
 */
export interface SoloResult {
    output: string;
    analysis: Partial<SoloAnalysis>;
    totalTokens: number;
    totalCostUsd: number;
    durationMs: number;
    degraded: boolean;
    degradationReason?: string;
}
/**
 * Factory that resolves a model identifier to an LLMProvider. The
 * providerFactory pattern decouples solo from the registry, which makes
 * testing trivial (pass a mock factory).
 */
export type SoloProviderFactory = (modelId: string) => LLMProvider;
//# sourceMappingURL=solo-types.d.ts.map