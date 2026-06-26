/**
 * ArtifactImprover — analyzes existing skills and workflows for improvement.
 *
 * Compares what artifacts say vs what agents actually did in sessions,
 * detects misalignments, and generates improvement signals.
 *
 * Improvement types:
 *   - skill-not-followed: agent ignored skill instructions
 *   - workflow-deviation: agent reordered/skipped workflow steps
 *   - tool-friction: recommended tools were denied/asked
 *   - cost-inefficient: forced model tier doesn't match actual complexity
 *   - quality-failure: artifact-related quality issues
 */
import type { SessionPattern, ImprovementSignal, SkillSynthesisResult, WorkflowSynthesisResult } from './types.js';
import type { LoadedSkill } from '@chimera/core';
export declare class ArtifactImprover {
    /**
     * Analyze a skill's effectiveness.
     */
    analyzeSkillEffectiveness(skill: LoadedSkill, patterns: SessionPattern[]): ImprovementSignal;
    /**
     * Analyze a workflow's effectiveness.
     */
    analyzeWorkflowEffectiveness(workflow: {
        name: string;
        steps: Array<{
            id: string;
            kind: string;
            config: Record<string, unknown>;
        }>;
    }, patterns: SessionPattern[]): ImprovementSignal;
    /**
     * Generate an improved skill from improvement signals.
     */
    improveSkill(skill: LoadedSkill, signal: ImprovementSignal, patterns: SessionPattern[]): SkillSynthesisResult;
    /**
     * Generate an improved workflow from improvement signals.
     */
    improveWorkflow(workflow: {
        name: string;
        description?: string;
        steps: Array<{
            id: string;
            kind: string;
            config: Record<string, unknown>;
        }>;
    }, signal: ImprovementSignal, patterns: SessionPattern[]): WorkflowSynthesisResult;
}
//# sourceMappingURL=artifact-improver.d.ts.map