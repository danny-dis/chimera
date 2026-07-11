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
    /**
     * Last-resort harness nudge: when the model researched/summarized but never
     * wrote a single file on a task that clearly wants files, send one explicit
     * turn that demands write_file calls, then execute whatever it emits.
     */
    private forceWriteTurn;
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
    /**
     * Build a plain-text summary from tool results when the model's closing
     * turn fails or returns nothing. Keeps a tool-driven run useful even on
     * small/finicky models that can't produce a coherent closing message.
     */
    private summarizeToolResults;
    private degraded;
}
//# sourceMappingURL=solo-executor.d.ts.map