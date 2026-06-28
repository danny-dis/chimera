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

const TASK_TYPE_SIGNALS: Record<string, string[]> = {
  debug: ['fix', 'error', 'bug', 'failing', 'broken', 'crash', 'exception', 'regression'],
  review: ['review', 'audit', 'check', 'critique', 'evaluate', 'assess'],
  hive: ['multiple', 'several', 'complex', 'comprehensive', 'thorough', 'elaborate'],
  fusion: ['compare', 'perspectives', 'alternatives', 'options', 'debate'],
};

export class PresetRouter {
  private readonly thresholds: { solo: number; duo: number };
  private readonly taskTypeOverrides: Partial<Record<string, DeliberationMode>>;

  constructor(config?: PresetRouterConfig) {
    this.thresholds = config?.complexityThresholds ?? { solo: 0.3, duo: 0.6 };
    // Default overrides: when a task type is detected from keywords
    // (TASK_TYPE_SIGNALS), map it directly to the optimal preset.
    // "fusion" and "hive" here are task *types* (keyword classifications),
    // not presets — they happen to share names with the presets they map to.
    this.taskTypeOverrides = config?.taskTypeOverrides ?? {
      debug: 'solo',    // debug tasks → single-agent fix
      review: 'duo',    // review tasks → two-perspective analysis
      fusion: 'fusion', // "compare/alternatives" tasks → multi-model panel + judge
      hive: 'hive',     // "multiple/several" tasks → decompose + parallel execution
    };
  }

  /**
   * Select the optimal preset based on task characteristics.
   *
   * @param task - The task description
   * @param complexity - Complexity score from TaskRouter
   * @param availableProviders - List of available provider IDs
   * @returns The selected DeliberationMode
   */
  selectPreset(
    task: string,
    complexity: ComplexityScore,
    availableProviders: string[],
  ): DeliberationMode {
    // 1. Check task type signals first (highest priority)
    const taskType = this.classifyTaskType(task);
    const override = this.taskTypeOverrides[taskType];
    if (override) {
      return override;
    }

    // 2. Fall back to complexity-based selection
    return this.selectByComplexity(complexity, availableProviders);
  }

  /**
   * Classify task type from natural language signals.
   * Returns 'code' if no specific type is detected.
   */
  classifyTaskType(task: string): string {
    const lower = task.toLowerCase();

    for (const [type, signals] of Object.entries(TASK_TYPE_SIGNALS)) {
      if (signals.some((s) => lower.includes(s))) {
        return type;
      }
    }

    return 'code';
  }

  /**
   * Select preset based on complexity score and provider availability.
   *
   * Priority order:
   *   1. Task type signals (debug, review, hive, fusion) → override
   *   2. High complexity (>= 0.6) + 2+ providers → trio
   *   3. Medium complexity (>= 0.3) + 2+ providers → duo
   *   4. Low complexity (< 0.3) → solo
   */
  private selectByComplexity(
    complexity: ComplexityScore,
    availableProviders: string[],
  ): DeliberationMode {
    const { solo, duo } = this.thresholds;
    const providerCount = availableProviders.length;

    // Low complexity → solo
    if (complexity.overall < solo) {
      return 'solo';
    }

    // Medium complexity → duo (requires 2+ providers)
    if (complexity.overall < duo && providerCount >= 2) {
      return 'duo';
    }

    // High complexity → trio (requires 2+ providers)
    if (complexity.overall >= duo && providerCount >= 2) {
      return 'trio';
    }

    // Fallback: not enough providers for multi-agent presets
    return 'solo';
  }
}

/**
 * Get a human-readable reason for the auto-selection.
 * Useful for observability and debugging.
 */
export function getAutoSelectionReason(
  _preset: DeliberationMode,
  complexity: ComplexityScore,
  taskType: string,
): string {
  if (taskType !== 'code') {
    return `Task type "${taskType}" detected`;
  }

  if (complexity.overall < 0.3) {
    return `Low complexity (${complexity.overall.toFixed(2)})`;
  }

  if (complexity.overall < 0.6) {
    return `Medium complexity (${complexity.overall.toFixed(2)})`;
  }

  return `High complexity (${complexity.overall.toFixed(2)})`;
}
