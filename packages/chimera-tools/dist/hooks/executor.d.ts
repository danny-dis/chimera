/**
 * HookExecutor — runs hook scripts and manages hook lifecycle.
 *
 * Supports both inline scripts and external commands. Handles timeouts,
 * error suppression, and param modification.
 */
import type { HookDefinition, HookContext, HookResult } from './schema.js';
export interface HookExecutorOptions {
    /** Default timeout for hooks in ms */
    defaultTimeout?: number;
    /** Whether to suppress hook errors (default: true) */
    suppressErrors?: boolean;
    /** Working directory fallback */
    defaultCwd?: string;
}
export declare class HookExecutor {
    private hooks;
    private options;
    constructor(options?: HookExecutorOptions);
    /**
     * Register a hook definition.
     */
    register(hook: HookDefinition): void;
    /**
     * Register multiple hooks.
     */
    registerAll(hooks: HookDefinition[]): void;
    /**
     * Load hooks from a YAML config file.
     */
    loadFromFile(filePath: string): Promise<void>;
    /**
     * Load hooks from .chimera/hooks.yaml in the workspace.
     */
    loadFromWorkspace(workspaceRoot: string): Promise<void>;
    /**
     * Execute all hooks for a given event.
     * Returns results in priority order.
     */
    executeHooks(event: string, context: HookContext): Promise<HookResult[]>;
    /**
     * Get all registered hooks.
     */
    getHooks(): HookDefinition[];
    /**
     * Get hooks for a specific event.
     */
    getHooksForEvent(event: string): HookDefinition[];
    /**
     * Remove a hook by id.
     */
    removeHook(id: string): boolean;
    /**
     * Clear all hooks.
     */
    clear(): void;
    private executeOne;
    private executeInlineScript;
    private executeCommand;
    private matchesFilter;
}
//# sourceMappingURL=executor.d.ts.map