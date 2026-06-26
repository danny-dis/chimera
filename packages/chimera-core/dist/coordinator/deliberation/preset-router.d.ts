/**
 * `PresetRouter` — selects the optimal deliberation preset based on
 * task characteristics (complexity, type signals, provider availability).
 *
 * Single responsibility: preset selection logic. No I/O, no side effects.
 * The router is a pure function of its inputs — deterministic and testable.
 *
 * Design:
 *   - Task type signals (debug, review, merge, fusion) take precedence
 *     over complexity-based selection.
 *   - Complexity thresholds are configurable via constructor.
 *   - Provider availability prevents selecting presets that can't run.
 *   - Falls back to 'solo' when inputs are ambiguous.
 */
import type { ComplexityScore } from '../../types/router.js';
import type { DeliberationMode } from './types.js';
/** Configuration for preset selection thresholds and overrides. */
export interface PresetRouterConfig {
    /**
     * Complexity thresholds for preset selection.
     * Defaults: solo < 0.3, duo < 0.6, trio >= 0.6
     */
    complexityThresholds?: {
        solo: number;
        duo: number;
    };
    /**
     * Task type → preset overrides. When a task type is detected,
     * the override preset is used regardless of complexity.
     */
    taskTypeOverrides?: Partial<Record<string, DeliberationMode>>;
}
export declare class PresetRouter {
    private readonly thresholds;
    private readonly taskTypeOverrides;
    constructor(config?: PresetRouterConfig);
    /**
     * Select the optimal preset based on task characteristics.
     *
     * @param task - The task description
     * @param complexity - Complexity score from TaskRouter
     * @param availableProviders - List of available provider IDs
     * @returns The selected DeliberationMode
     */
    selectPreset(task: string, complexity: ComplexityScore, availableProviders: string[]): DeliberationMode;
    /**
     * Classify task type from natural language signals.
     * Returns 'code' if no specific type is detected.
     */
    classifyTaskType(task: string): string;
    /**
     * Select preset based on complexity score and provider availability.
     *
     * Priority order:
     *   1. Task type signals (debug, review, hive, fusion) → override
     *   2. Very high complexity (>= 0.8) + 2+ providers → fusion
     *   3. High complexity (>= 0.7) + decomposable signals → hive
     *   4. High complexity (>= 0.6) + 2+ providers → trio
     *   5. Medium complexity (>= 0.3) + 2+ providers → duo
     *   6. Low complexity (< 0.3) → solo
     */
    private selectByComplexity;
}
/**
 * Get a human-readable reason for the auto-selection.
 * Useful for observability and debugging.
 */
export declare function getAutoSelectionReason(_preset: DeliberationMode, complexity: ComplexityScore, taskType: string): string;
//# sourceMappingURL=preset-router.d.ts.map