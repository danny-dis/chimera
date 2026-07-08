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
    /**
     * Best-effort type coercion for tool args emitted by chat models, which
     * routinely send booleans/numbers as JSON strings (e.g. overwrite: "True",
     * timeout: "30"). Zod's strict `.parse()` rejects those, which silently
     * breaks the tool round-trip. We walk the schema and coerce string values
     * to the expected scalar type so small/finicky models still drive tools.
     */
    coerceParams(name: string, params: Record<string, unknown>): Record<string, unknown>;
    execute(name: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
//# sourceMappingURL=tool-registry.d.ts.map