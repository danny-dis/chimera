/**
 * WorkflowSynthesizer — generates workflow definitions from session patterns.
 *
 * Maps repeated tool sequences to chimera-core WorkflowDefinition steps.
 * Heuristics:
 *   - read_file, search_files → llm (analysis) step
 *   - edit_file, write_file → llm (implementation) step
 *   - run_shell_command → tool (test/execution) step
 *   - git_* → tool (version control) step
 *   - Sequential reads → parallel step (fan-out)
 *   - After writes → gate (quality check) step
 *
 * Generated workflows use the chimera-core step-based format
 * (WorkflowDefinition with WorkflowStep[]).
 */
import type { SessionPattern, DomainCluster, RepeatedSequence, WorkflowSynthesisResult } from './types.js';
export declare class WorkflowSynthesizer {
    /**
     * Convert a RepeatedSequence into a workflow definition.
     */
    synthesizeFromSequence(sequence: RepeatedSequence): WorkflowSynthesisResult;
    /**
     * Generate a workflow from a domain cluster's common patterns.
     */
    synthesizeFromCluster(cluster: DomainCluster): WorkflowSynthesisResult;
    /**
     * Improve an existing workflow based on new session data.
     */
    improveExisting(existing: {
        name: string;
        description?: string;
        steps: Array<{
            id: string;
            kind: string;
            config: Record<string, unknown>;
        }>;
    }, patterns: SessionPattern[]): WorkflowSynthesisResult;
}
//# sourceMappingURL=workflow-synthesizer.d.ts.map