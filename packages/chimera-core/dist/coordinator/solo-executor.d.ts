import { EventStream } from '../event-stream.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type { SoloConfig, SoloContext, SoloResult, SoloProviderFactory } from './solo-types.js';
export type { SoloConfig, SoloContext, SoloResult, SoloProviderFactory, SoloAnalysis, } from './solo-types.js';
interface SoloExecutorDeps {
    eventStream: EventStream;
    /** Model registry — used for cost lookups. */
    registry: ModelRegistry;
    /** Optional cost tracker. */
    costTracker?: CostTracker;
}
/**
 * The simplest executor: one model answers one prompt.
 *
 * It supports two sub-modes:
 *   1. Direct (selfVerify=false): One LLM call.
 *   2. Self-Correction (selfVerify=true): Two sequential LLM calls
 *      (Writer -> Reviewer) using the same model.
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `SoloContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke tests live in `__tests__/`
 */
export declare class SoloExecutor {
    private eventStream;
    private registry;
    private costTracker;
    constructor(deps: SoloExecutorDeps);
    /**
     * Run a solo execution and return the final response as a string.
     * For structured access to the analysis, use {@link executeWithAnalysis}.
     */
    execute(task: string, config: SoloConfig, providerFactory: SoloProviderFactory, context?: SoloContext): Promise<string>;
    /**
     * Run a solo execution and return the full structured result.
     */
    executeWithAnalysis(task: string, config: SoloConfig, providerFactory: SoloProviderFactory, context?: SoloContext): Promise<SoloResult>;
    private callPeer;
    private buildThinkPrompt;
    private buildDraftPrompt;
    private buildReviewPrompt;
    private finalizeSolo;
    private computeCost;
    private lookupModel;
    private recordSpend;
    private isOverBudget;
    private safeEmit;
    /**
     * Pick the response most useful to the user. The reviewer may produce
     * meta-analysis ("Reviewer verdict: PASS") rather than an actual
     * answer. In that case, fall back to the writer's draft.
     */
    private chooseBestResponse;
    private degraded;
}
//# sourceMappingURL=solo-executor.d.ts.map