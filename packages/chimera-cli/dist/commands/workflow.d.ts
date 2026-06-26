/**
 * `chimera workflow …` — list, inspect, and run declarative workflows.
 *
 *   chimera workflow list                  — show every registered workflow
 *   chimera workflow show <name>           — print the workflow's YAML/JSON
 *   chimera workflow run <name>            — execute a workflow
 *     --input <json>                       — initial state.inputs (default {})
 *
 * Workflow sources are: workspace (`<ws>/.chimera/workflows/*.yaml|yml|json`),
 * global (`~/.config/chimera/workflows/…`), or inline (registered in code).
 * The CLI loads workspace+global via `WorkflowAutoLoader` and then merges in
 * any built-in workflows registered by `chimera-core` at import time
 * (e.g. `standard-draft`, `parallel-decompose`, `quality-gate`).
 */
import { Command } from 'commander';
import { WorkflowRegistry, type WorkflowDefinition } from '@chimera/core';
interface WorkflowSource {
    registry: WorkflowRegistry;
    source: 'workspace' | 'global' | 'builtin';
    path?: string;
}
interface FoundWorkflow {
    definition: WorkflowDefinition;
    source: 'workspace' | 'global' | 'builtin';
}
declare function loadWorkflowRegistry(workspaceRoot: string): Promise<WorkflowSource[]>;
/**
 * Register the `workflow` subcommand tree on a parent `Command`.
 */
export declare function registerWorkflowCommand(parent: Command): Command;
declare function collectAll(sources: WorkflowSource[]): FoundWorkflow[];
declare function findInSources(sources: WorkflowSource[], name: string): FoundWorkflow | null;
export declare const __test__: {
    loadWorkflowRegistry: typeof loadWorkflowRegistry;
    collectAll: typeof collectAll;
    findInSources: typeof findInSources;
};
export {};
//# sourceMappingURL=workflow.d.ts.map