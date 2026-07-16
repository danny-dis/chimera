import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';
import type { PermissionEngine } from './permission/policy.js';
export type PermissionChecker = (tool: string, params: Record<string, unknown>) => PermissionDecision;
export declare class ToolExecutor {
    private registry;
    private permissionCheck;
    private permissionEngine?;
    constructor(registry: ToolRegistry, permissionCheck: PermissionChecker, permissionEngine?: PermissionEngine);
    /** Swap in a policy engine at startup (e.g. read-only mode toggle). */
    setPermissionEngine(engine: PermissionEngine): void;
    execute(toolName: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
//# sourceMappingURL=tool-executor.d.ts.map