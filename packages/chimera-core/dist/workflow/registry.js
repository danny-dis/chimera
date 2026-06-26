"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRegistry = void 0;
/**
 * In-memory store of WorkflowDefinition objects keyed by `name`.
 *
 * Designed for single-threaded JS usage. No locking, no async — registry
 * mutations happen during bootstrap (auto-loader, CLI init) and reads
 * dominate after that.
 */
class WorkflowRegistry {
    workflows = new Map();
    /**
     * Register a workflow. If a workflow with the same name already exists it
     * is replaced — last-writer-wins, no merge.
     */
    register(workflow) {
        if (!workflow || !workflow.name) {
            throw new Error('WorkflowRegistry.register: workflow.name is required');
        }
        this.workflows.set(workflow.name, workflow);
    }
    /** Retrieve a workflow by name, or `undefined` if absent. */
    get(name) {
        return this.workflows.get(name);
    }
    /** True if a workflow with the given name has been registered. */
    has(name) {
        return this.workflows.has(name);
    }
    /** Snapshot of all registered workflows, in registration order. */
    list() {
        return Array.from(this.workflows.values());
    }
    /** Remove all workflows. Mainly useful in tests. */
    clear() {
        this.workflows.clear();
    }
}
exports.WorkflowRegistry = WorkflowRegistry;
//# sourceMappingURL=registry.js.map