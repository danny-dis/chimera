import { EventStream } from '../event-stream.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type { DuoConfig, DuoContext, DuoResult, DuoProviderFactory } from './duo-types.js';
export type { DuoConfig, DuoContext, DuoSource, DuoResult, DuoAnalysis, DuoProviderFactory, } from './duo-types.js';
interface DuoExecutorDeps {
    eventStream: EventStream;
    /** Model registry — used for cost lookups and (future) capability checks. */
    registry: ModelRegistry;
    /** Optional cost tracker. */
    costTracker?: CostTracker;
}
/**
 * Two-model sequential deliberation with **deterministic** synthesis.
 *
 * Distinct from `FusionExecutor` and `TrioExecutor`:
 *   - Both models are called **sequentially** — Model A writes a draft,
 *     then Model B reviews it.
 *   - The synthesis is **always** the deterministic `ResponseSynthesizer`
 *     (Jaccard + role authority). There is no LLM judge.
 *   - role assignment: modelA → 'writer' (confidence 0.8), modelB →
 *     'reviewer' (confidence 0.7).
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `DuoContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke tests live in `__tests__/duo-executor.test.ts`
 */
export declare class DuoExecutor {
    private eventStream;
    private registry;
    private costTracker;
    constructor(deps: DuoExecutorDeps);
    /**
     * Run a duo deliberation and return the synthesized response as a
     * string. For structured access to the analysis, use
     * {@link executeWithAnalysis}.
     */
    execute(task: string, config: DuoConfig, providerFactory: DuoProviderFactory, context?: DuoContext): Promise<string>;
    /**
     * Run a duo deliberation and return the full structured result.
     */
    executeWithAnalysis(task: string, config: DuoConfig, providerFactory: DuoProviderFactory, context?: DuoContext): Promise<DuoResult>;
    private callPeer;
    private deriveConsensus;
    private buildPeerPrompt;
    private buildReviewPrompt;
    private runLinter;
    private computeCost;
    private lookupModel;
    private recordSpend;
    private isOverBudget;
    private safeEmit;
    private degraded;
}
//# sourceMappingURL=duo-executor.d.ts.map