import type { WorkflowDefinition } from './types.js';
/**
 * In-memory store of WorkflowDefinition objects keyed by `name`.
 *
 * Designed for single-threaded JS usage. No locking, no async — registry
 * mutations happen during bootstrap (auto-loader, CLI init) and reads
 * dominate after that.
 */
export declare class WorkflowRegistry {
    private workflows;
    /**
     * Register a workflow. If a workflow with the same name already exists it
     * is replaced — last-writer-wins, no merge.
     */
    register(workflow: WorkflowDefinition): void;
    /** Retrieve a workflow by name, or `undefined` if absent. */
    get(name: string): WorkflowDefinition | undefined;
    /** True if a workflow with the given name has been registered. */
    has(name: string): boolean;
    /** Snapshot of all registered workflows, in registration order. */
    list(): WorkflowDefinition[];
    /** Remove all workflows. Mainly useful in tests. */
    clear(): void;
}
//# sourceMappingURL=registry.d.ts.map