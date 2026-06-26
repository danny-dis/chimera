import type { LLMProvider } from '../session-orchestrator.js';
/**
 * Configuration for a fusion-mode deliberation. Modeled after OpenRouter's
 * Fusion Router config: a panel of analysis models, a separate judge, and
 * optional per-call knobs that get forwarded to the inner LLM calls.
 */
export interface FusionConfig {
    /** Panel of model identifiers (resolved via the ModelRegistry). */
    analysisModels: string[];
    /**
     * Number of panel models to load automatically if analysisModels is empty.
     * Also referred to as N.
     */
    panelSize?: number;
    /**
     * If true, prioritize models with provider: 'local' when auto-filling the panel.
     */
    preferLocal?: boolean;
    /**
     * If true, perform a second round of deliberation where panel models
     * respond to identified conflicts before the final judge call.
     */
    adversarialRound?: boolean;
    /**
     * If true, inject diverse personas into the panel models (e.g., security,
     * performance, readability) to ensure a wider range of perspectives.
     */
    diversePerspectives?: boolean;
    /** Judge model identifier. Should be the strongest available model. */
    judgeModel: string;
    /**
     * Fallback judge models tried in order if the primary judge fails
     * (provider resolution error or call throws). Mirrors the
     * `fusion_fallback_judge` event. If empty, only `judgeModel` is tried.
     */
    judgeFailover?: string[];
    /** Sampling temperature forwarded to all inner panel and judge calls. 0–2. */
    temperature?: number;
    /** Max output tokens (including reasoning) per inner call. */
    maxCompletionTokens?: number;
    /** Max tool-calling steps per inner call. 1–16. */
    maxToolCalls?: number;
    /** Reasoning config forwarded to panel and judge. */
    reasoning?: {
        effort?: 'low' | 'medium' | 'high';
        maxTokens?: number;
    };
    /** Force the engine to always run (equivalent to OpenRouter's tool_choice: "required"). */
    forceInvocation?: boolean;
    /** Enable web search on panel and judge calls (analogue of OpenRouter's web_search tool). */
    webSearch?: boolean;
    /** Enable web fetch on panel and judge calls. */
    webFetch?: boolean;
    /** Maximum recursion depth. Default 1 — same as OpenRouter's behavior. */
    maxDepth?: number;
    /** Per-task budget in USD. Triggers fusion_budget_exceeded event. */
    budgetUsd?: number;
}
/**
 * Context carried through recursive fusion calls. The top-level caller
 * passes `depth: 0`; if fusion is invoked from within fusion, the child
 * inherits `depth: parent + 1`. Mirrors OpenRouter's `x-openrouter-fusion-depth`
 * header.
 */
export interface FusionContext {
    depth: number;
}
/**
 * Factory that resolves a model identifier to an LLMProvider. The
 * providerFactory pattern decouples fusion from the registry, which makes
 * testing trivial (pass a mock factory).
 */
export type FusionProviderFactory = (modelId: string) => LLMProvider;
/**
 * Per-panel-model call result. The fused analysis is built from a list of
 * these plus the judge output.
 */
export interface FusionPanelResult {
    modelId: string;
    content: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    error?: string;
}
/**
 * Analysis produced by the judge. The 5-field shape mirrors OpenRouter's
 * structured output: consensus (agreement), contradictions, coverage gaps
 * (things missed by all), unique insights (single-model contributions), and
 * blind spots (worth re-checking).
 */
export interface FusionAnalysis {
    thought: string;
    finalResponse: string;
    consensus: string[];
    conflicts: string[];
    uniqueInsights: string[];
    blindSpots: string[];
    confidence: number;
}
/**
 * Extended FusionResult with degradation metadata. The degraded flag is
 * true when the executor fell back to a non-fusion path (e.g. judge
 * returned malformed JSON, all panel models failed, budget exceeded).
 */
export interface FusionResultV2 {
    output: string;
    analysis: Partial<FusionAnalysis>;
    totalTokens: number;
    totalCostUsd: number;
    durationMs: number;
    degraded: boolean;
    degradationReason?: string;
}
//# sourceMappingURL=fusion-types.d.ts.map