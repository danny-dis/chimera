import type { WorkflowDefinition } from './types.js';

/**
 * In-memory store of WorkflowDefinition objects keyed by `name`.
 *
 * Designed for single-threaded JS usage. No locking, no async — registry
 * mutations happen during bootstrap (auto-loader, CLI init) and reads
 * dominate after that.
 */
export class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Register a workflow. If a workflow with the same name already exists it
   * is replaced — last-writer-wins, no merge.
   */
  register(workflow: WorkflowDefinition): void {
    if (!workflow || !workflow.name) {
      throw new Error('WorkflowRegistry.register: workflow.name is required');
    }
    this.workflows.set(workflow.name, workflow);
  }

  /** Retrieve a workflow by name, or `undefined` if absent. */
  get(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  /** True if a workflow with the given name has been registered. */
  has(name: string): boolean {
    return this.workflows.has(name);
  }

  /** Snapshot of all registered workflows, in registration order. */
  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /** Remove all workflows. Mainly useful in tests. */
  clear(): void {
    this.workflows.clear();
  }
}
