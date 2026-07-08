/**
 * LLM-based judge for evaluating trajectory quality.
 * Uses the sideQuery channel to get a cheap LLM's assessment.
 */
import type { ModelProvider } from '@chimera/providers';
import type { Trajectory, TaskSpec } from './eval-harness.js';
export interface JudgeVerdict {
    score: number;
    confidence: number;
    rationale: string;
    raw: string;
    provider: string;
    model: string;
}
/**
 * Ask an LLM judge to score a trajectory.
 * Falls back to 0.5 / low confidence on parse failure.
 */
export declare function judgeTrajectory(trajectory: Trajectory, task: TaskSpec, provider: ModelProvider): Promise<JudgeVerdict>;
/**
 * Format a JudgeVerdict into a human-readable one-liner.
 */
export declare function formatJudgeScore(verdict: JudgeVerdict): string;
//# sourceMappingURL=judge-llm.d.ts.map