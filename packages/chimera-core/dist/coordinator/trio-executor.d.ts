import { EventStream } from '../event-stream.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type { WorktreeIsolation } from '../agent/worktree-isolation.js';
import type { TrioConfig, TrioContext, TrioResult, TrioProviderFactory } from './trio-types.js';
export type { TrioConfig, TrioContext, TrioStageResult, TrioResult, TrioAnalysis, TrioProviderFactory, } from './trio-types.js';
interface TrioExecutorDeps {
    eventStream: EventStream;
    /** Model registry — used for cost lookups and (future) capability checks. */
    registry: ModelRegistry;
    /** Optional cost tracker. */
    costTracker?: CostTracker;
    /**
     * Optional worktree isolation. Required only when `config.isolateWorktree`
     * is true. The executor will not instantiate this itself.
     */
    worktreeIsolation?: WorktreeIsolation;
    /** Optional workspace root — required to execute edit tools. */
    workspaceRoot?: string;
    /** Optional tool executor — when present the writer becomes tool-capable. */
    toolExecutor?: ToolExecutorInterface;
    /** Optional tool registry — supplies tool definitions to the writer. */
    toolRegistry?: ToolRegistryInterface;
}
/**
 * Multi-stage quality gate: writer → reviewer → [challenger] → synthesize.
 *
 * Distinct from `FusionExecutor`:
 *   - Stages are **serial**, not parallel — each stage depends on the
 *     previous one's output. The reviewer sees the draft; the challenger
 *     sees the draft + review.
 *   - The synthesizer is **optional**. By default, the deterministic
 *     `ResponseSynthesizer` is used (Jaccard + role authority). This
 *     keeps trio cheap — no extra LLM call beyond the stage calls.
 *   - The draft can be wrapped in a `WorktreeIsolation` worktree.
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth, failover)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `TrioContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output (consensus / conflicts / insights / blind spots / final)
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke + benchmark tests live in `__tests__/`
 */
export declare class TrioExecutor {
    private eventStream;
    private registry;
    private costTracker;
    private worktreeIsolation;
    private workspaceRoot?;
    private toolExecutor?;
    private toolRegistry?;
    constructor(deps: TrioExecutorDeps);
    /**
     * Run a trio deliberation and return the final synthesized response
     * as a string. For structured access to the analysis, use
     * {@link executeWithAnalysis}.
     */
    execute(task: string, config: TrioConfig, providerFactory: TrioProviderFactory, context?: TrioContext): Promise<string>;
    /**
     * Run a trio deliberation and return the full structured result.
     */
    executeWithAnalysis(task: string, config: TrioConfig, providerFactory: TrioProviderFactory, context?: TrioContext): Promise<TrioResult>;
    private runLlmSynthesizer;
    private runDeterministicSynthesis;
    private safeDeterministicSynthesis;
    private deriveConsensus;
    private buildDraftPrompt;
    private buildReviewPrompt;
    private buildChallengePrompt;
    private buildDraftMessages;
    private buildReviewMessages;
    private buildChallengeMessages;
    private buildSynthesizerPrompt;
    private buildRevisionMessages;
    private tryExtractIssues;
    private tryExtractChallenges;
    private needsRevision;
    private runLinter;
    private computeCost;
    private lookupModel;
    private recordSpend;
    private isOverBudget;
    private safeEmit;
    private degraded;
}
//# sourceMappingURL=trio-executor.d.ts.map