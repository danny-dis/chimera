"use strict";
/**
 * Bootstrap — minimal bootstrap for the daemon process.
 *
 * Creates a workflow registry. This is a simplified version of
 * @chimera/core's bootstrap that doesn't depend on unexported internals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRegistry = void 0;
exports.bootstrap = bootstrap;
class WorkflowRegistry {
    workflows = new Map();
    register(name, workflow) {
        this.workflows.set(name, workflow);
    }
    get(name) {
        return this.workflows.get(name);
    }
    list() {
        return Array.from(this.workflows.keys());
    }
}
exports.WorkflowRegistry = WorkflowRegistry;
function bootstrap() {
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
//# sourceMappingURL=bootstrap.js.map