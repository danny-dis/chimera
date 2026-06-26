"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
class ToolRegistry {
    tools = new Map();
    register(tool) {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    getAll() {
        return Array.from(this.tools.values());
    }
    getByCategory(category) {
        return this.getAll().filter((tool) => tool.category === category);
    }
    getByPermissionLevel(level) {
        return this.getAll().filter((tool) => tool.permissionLevel === level);
    }
    has(name) {
        return this.tools.has(name);
    }
    unregister(name) {
        return this.tools.delete(name);
    }
    validateParams(name, params) {
        const tool = this.get(name);
        if (!tool) {
            return { valid: false, errors: [`Tool "${name}" not found`] };
        }
        const result = tool.parameters.safeParse(params);
        if (!result.success) {
            const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
            return { valid: false, errors };
        }
        return { valid: true };
    }
    /**
     * Parse and validate params, returning the parsed data with schema
     * defaults applied. Use this when invoking a tool so `.default()` values
     * declared in the Zod schema are honored.
     */
    parseParams(name, params) {
        const tool = this.get(name);
        if (!tool) {
            throw new Error(`Tool "${name}" not found`);
        }
        return tool.parameters.parse(params);
    }
    async execute(name, params, context) {
        const tool = this.get(name);
        if (!tool) {
            return {
                success: false,
                error: `Tool "${name}" not found`,
                duration: 0,
            };
        }
        // Parse with defaults applied (Zod's parse() throws on failure).
        let parsedParams;
        try {
            parsedParams = tool.parameters.parse(params);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                error: `Invalid params: ${message}`,
                duration: 0,
            };
        }
        const startTime = Date.now();
        try {
            const data = await tool.execute(parsedParams, context);
            const duration = Date.now() - startTime;
            // Validate return value
            const returnResult = tool.returns.safeParse(data);
            if (!returnResult.success) {
                return {
                    success: false,
                    error: `Invalid return value: ${returnResult.error.errors.map((e) => e.message).join(', ')}`,
                    duration,
                };
            }
            return {
                success: true,
                data: data,
                duration,
            };
        }
        catch (err) {
            const duration = Date.now() - startTime;
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
                duration,
            };
        }
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=tool-registry.js.map