"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutor = void 0;
class ToolExecutor {
    registry;
    permissionCheck;
    constructor(registry, permissionCheck) {
        this.registry = registry;
        this.permissionCheck = permissionCheck;
    }
    async execute(toolName, params, context) {
        // Check tool exists
        const tool = this.registry.get(toolName);
        if (!tool) {
            return {
                success: false,
                error: `Tool "${toolName}" not found`,
                duration: 0,
            };
        }
        // Coerce model-emitted string args into the types the schema expects
        // (small models often send booleans/numbers as JSON strings).
        const coerced = this.registry.coerceParams(toolName, params);
        // Validate params
        const validation = this.registry.validateParams(toolName, coerced);
        if (!validation.valid) {
            return {
                success: false,
                error: `Parameter validation failed: ${validation.errors?.join(', ')}`,
                duration: 0,
            };
        }
        // Check permission
        const decision = this.permissionCheck(toolName, params);
        if (decision === 'deny') {
            return {
                success: false,
                error: `Permission denied for tool "${toolName}"`,
                duration: 0,
            };
        }
        if (decision === 'ask') {
            // Emit event requesting permission
            context.eventStream.append({
                type: 'tool_call_requested',
                call: { tool: toolName, args: params },
                policy: 'ask',
            });
            return {
                success: false,
                error: `Permission pending for tool "${toolName}"`,
                duration: 0,
            };
        }
        // Execute
        const result = await this.registry.execute(toolName, coerced, context);
        // Emit result event
        context.eventStream.append({
            type: 'tool_call_result',
            result: {
                tool: toolName,
                output: result.success
                    ? JSON.stringify(result.data)
                    : result.error ?? 'unknown error',
                exitCode: result.success ? 0 : 1,
            },
        });
        return result;
    }
}
exports.ToolExecutor = ToolExecutor;
//# sourceMappingURL=tool-executor.js.map