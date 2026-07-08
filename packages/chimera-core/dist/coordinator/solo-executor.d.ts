import { EventStream } from '../event-stream.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { SoloConfig, SoloContext, SoloResult, SoloProviderFactory } from './solo-types.js';
export type { SoloConfig, SoloContext, SoloResult, SoloProviderFactory, SoloAnalysis, } from './solo-types.js';
interface SoloExecutorDeps {
    eventStream: EventStream;
    /** Model registry — used for cost lookups. */
    registry: ModelRegistry;
    /** Optional cost tracker. */
    costTracker?: CostTracker;
    /** Optional workspace root — required to execute edit tools. */
    workspaceRoot?: string;
    /** Optional tool executor — when present the writer becomes tool-capable. */
    toolExecutor?: ToolExecutorInterface;
    /** Optional tool registry — supplies tool definitions to the LLM. */
    toolRegistry?: ToolRegistryInterface;
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
    private workspaceRoot?;
    private toolExecutor?;
    private toolRegistry?;
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
    /**
     * Resolve tool definitions from the registry into the shape `provider.complete`
     * expects. Returns `[]` when no registry is available.
     */
    private listToolDefs;
    /**
     * Feed tool results back to the writer for one follow-up turn. Mirrors the
     * orchestrator's `buildToolResultMessages` contract: an assistant message
     * carrying the tool_calls, followed by one `tool` message per call.
     */
    private followUpWithToolResults;
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