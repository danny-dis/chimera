/**
 * Bootstrap — minimal bootstrap for the daemon process.
 *
 * Creates a workflow registry. This is a simplified version of
 * @chimera/core's bootstrap that doesn't depend on unexported internals.
 */
export declare class WorkflowRegistry {
    private workflows;
    register(name: string, workflow: unknown): void;
    get(name: string): unknown;
    list(): string[];
}
export declare function bootstrap(): {
    workflowRegistry: WorkflowRegistry;
};
//# sourceMappingURL=bootstrap.d.ts.map