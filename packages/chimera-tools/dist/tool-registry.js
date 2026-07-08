"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
/**
 * Coerce a string arg to the scalar type the schema expects. Used to make
 * tool calling robust against models that emit booleans/numbers as JSON
 * strings. `Boolean("False")` is truthy in JS, so we map the common boolean
 * word/number spellings explicitly rather than relying on `Boolean()`.
 */
function coerceScalar(typeName, raw) {
    const s = raw.trim();
    if (typeName === 'ZodBoolean') {
        const lower = s.toLowerCase();
        if (['true', 'true.', '1', 'yes', 'y', 'on'].includes(lower))
            return true;
        if (['false', '0', 'no', 'n', 'off', 'null', 'none'].includes(lower))
            return false;
        return s; // leave for Zod to reject if truly invalid
    }
    if (typeName === 'ZodNumber') {
        const n = Number(s);
        return Number.isNaN(n) ? s : n;
    }
    if (typeName === 'ZodEnum') {
        return s;
    }
    return s;
}
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
    /**
     * Best-effort type coercion for tool args emitted by chat models, which
     * routinely send booleans/numbers as JSON strings (e.g. overwrite: "True",
     * timeout: "30"). Zod's strict `.parse()` rejects those, which silently
     * breaks the tool round-trip. We walk the schema and coerce string values
     * to the expected scalar type so small/finicky models still drive tools.
     */
    coerceParams(name, params) {
        const tool = this.get(name);
        if (!tool || !params || typeof params !== 'object')
            return params;
        const def = tool.parameters?._def;
        const typeName = def?.typeName;
        const shape = typeName === 'ZodEffects'
            ? def?.schema?._def?.shape
            : def?.shape;
        if (typeof shape !== 'function')
            return params;
        const out = { ...params };
        for (const [key, val] of Object.entries(shape())) {
            if (!(key in out))
                continue;
            const v = out[key];
            const fieldType = val?._def?.typeName;
            if (fieldType === 'ZodOptional' || fieldType === 'ZodDefault' || fieldType === 'ZodNullable') {
                const inner = val._def?.innerType;
                if (inner && typeof v === 'string')
                    out[key] = coerceScalar(inner._def?.typeName, v);
            }
            else if (typeof v === 'string') {
                out[key] = coerceScalar(fieldType, v);
            }
        }
        return out;
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