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
    /**
     * Parse and validate params, returning the parsed data with schema
     * defaults applied. Use this when invoking a tool so `.default()` values
     * declared in the Zod schema are honored.
     */
    parseParams<T = Record<string, unknown>>(name: string, params: Record<string, unknown>): T;
    execute(name: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
//# sourceMappingURL=tool-registry.d.ts.map