import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';
export type PermissionChecker = (tool: string, params: Record<string, unknown>) => PermissionDecision;
export declare class ToolExecutor {
    private registry;
    private permissionCheck;
    constructor(registry: ToolRegistry, permissionCheck: PermissionChecker);
    execute(toolName: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
//# sourceMappingURL=tool-executor.d.ts.map