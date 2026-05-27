import type { ToolDefinition, ToolContext, ToolResult, ValidationResult } from './tool-schema.js';
export declare class ToolRegistry {
    private tools;
    register(tool: ToolDefinition): void;
    get(name: string): ToolDefinition | undefined;
    getAll(): ToolDefinition[];
    getByCategory(category: string): ToolDefinition[];
    getByPermissionLevel(level: string): ToolDefinition[];
    has(name: string): boolean;
    unregister(name: string): boolean;
    validateParams(name: string, params: Record<string, unknown>): ValidationResult;
    execute(name: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
//# sourceMappingURL=tool-registry.d.ts.map