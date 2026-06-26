/**
 * Bootstrap — minimal bootstrap for the daemon process.
 * 
 * Creates a workflow registry. This is a simplified version of 
 * @chimera/core's bootstrap that doesn't depend on unexported internals.
 */

export class WorkflowRegistry {
  private workflows = new Map<string, unknown>();

  register(name: string, workflow: unknown): void {
    this.workflows.set(name, workflow);
  }

  get(name: string): unknown {
    return this.workflows.get(name);
  }

  list(): string[] {
    return Array.from(this.workflows.keys());
  }
}

export function bootstrap(): { workflowRegistry: WorkflowRegistry } {
  const workflowRegistry = new WorkflowRegistry();

  // Register the built-in quality gate workflow
  workflowRegistry.register('quality-gate', {
    name: 'quality-gate',
    description: 'Draft → Verify → Challenge → Synthesize pipeline',
    steps: [
      { kind: 'llm', role: 'reviewer' },
      { kind: 'parallel', steps: [{ kind: 'llm', role: 'challenger' }] },
      { kind: 'gate', verdict: 'PASS' },
    ],
  });

  workflowRegistry.register('standard-draft', {
    name: 'standard-draft',
    description: 'Single LLM call with writer prompt',
    steps: [{ kind: 'llm', role: 'writer' }],
  });

  return { workflowRegistry };
}