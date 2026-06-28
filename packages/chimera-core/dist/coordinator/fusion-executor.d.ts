import { EventStream } from '../event-stream.js';
import type { ModelRegistry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type { FusionConfig, FusionContext, FusionResultV2, FusionProviderFactory } from './fusion-types.js';
export type { FusionConfig, FusionContext, FusionPanelResult, FusionResultV2, FusionProviderFactory, FusionAnalysis, } from './fusion-types.js';
interface FusionExecutorDeps {
    eventStream: EventStream;
    registry: ModelRegistry;
    costTracker?: CostTracker;
}
/**
 * Multi-model deliberation (Fusion mode).
 * Parallel panel of models generates answers, then a judge synthesizes.
 */
export declare class FusionExecutor {
    private eventStream;
    private registry;
    private costTracker;
    constructor(deps: FusionExecutorDeps);
    execute(task: string, config: FusionConfig, providerFactory: FusionProviderFactory, context?: FusionContext): Promise<string>;
    executeWithAnalysis(task: string, config: FusionConfig, providerFactory: FusionProviderFactory, context?: FusionContext): Promise<FusionResultV2>;
    private buildJudgePrompt;
    private computeCost;
    private lookupModel;
    private recordSpend;
    private safeEmit;
    private degraded;
}
//# sourceMappingURL=fusion-executor.d.ts.map