/**
 * `DeliberationEngine` — single dispatch surface for the 5 deliberation
 * modes (solo, duo, trio, fusion, merge).
 *
 * The engine is a **thin facade**. It owns no new logic — each mode
 * delegates to the existing executor (`SoloExecutor`, `DuoExecutor`,
 * `TrioExecutor`, `ResultAggregator`) and normalizes the result to the
 * unified `DeliberationResult` shape. The `fusion` mode throws
 * `Error('fusion mode pending')` because `fusion-executor.ts` does not
 * exist yet; the gap is documented in the section 19.5 report and is
 * the subject of its own future work item.
 *
 * Determinism: the engine adds no new side effects. All events emitted
 * are produced by the underlying executors; the engine only routes and
 * normalizes. All 9 fusion safety-net patterns (defensive safeEmit,
 * factory injection, cost tracking, recursion guard, degraded fallback,
 * 5-field analysis shape, defensive usage access, test coverage) are
 * inherited from the executors themselves.
 */
import type { SubTaskResult } from '../types.js';
import type { DeliberationConfig, DeliberationEngineDeps, DeliberationMode, DeliberationResult, DuoDeliberationConfig, FusionDeliberationConfig, MergeDeliberationConfig, SoloDeliberationConfig, TrioDeliberationConfig, HiveDeliberationConfig, AutoDeliberationConfig } from './types.js';
export declare class DeliberationEngine {
    private deps;
    constructor(deps: DeliberationEngineDeps);
    /**
     * Dispatch on `config.mode` and return a normalized
     * `DeliberationResult`.
     */
    run(config: DeliberationConfig): Promise<DeliberationResult>;
    private runSolo;
    private runDuo;
    private runTrio;
    /**
     * Fusion mode is intentionally not implemented here. `fusion-executor.ts`
     * does not exist yet (only the type file `fusion-types.ts` does). The
     * test in `__tests__/fusion-executor.test.ts` references a missing
     * module and is itself a known gap tracked by another section.
     *
     * Routing is wired (this method exists, the dispatch is correct) so
     * the moment `FusionExecutor` lands, only this one method needs to
     * change.
     */
    private runFusion;
    private runMerge;
    private runHive;
    /**
     * Assign models to subtasks using capability-based routing.
     * Uses LlmRouter to classify each subtask and match it to the best model.
     */
    private assignModelsWithRouting;
    private runAuto;
    private estimateComplexity;
    private buildDelegatedConfig;
    private normalizeSolo;
    private normalizeDuo;
    private normalizeTrio;
}
/**
 * Convenience factories for the 5 modes. These produce the typed
 * `DeliberationConfig` directly without requiring callers to fill in
 * the `mode` discriminator manually.
 */
export declare const presets: {
    solo: (model: string, task: string) => SoloDeliberationConfig;
    duo: (modelA: string, modelB: string, task: string) => DuoDeliberationConfig;
    trio: (writer: string, reviewer: string, task: string, challenger?: string) => TrioDeliberationConfig;
    fusion: (analysisModels: string[], judgeModel: string, task: string) => FusionDeliberationConfig;
    merge: (subTaskResults: SubTaskResult[], mergeModel: string) => MergeDeliberationConfig;
    hive: (models: string[], task: string, modelPool?: import("../types.js").ModelPool) => HiveDeliberationConfig;
    auto: (task: string) => AutoDeliberationConfig;
};
export type { DeliberationMode };
//# sourceMappingURL=engine.d.ts.map