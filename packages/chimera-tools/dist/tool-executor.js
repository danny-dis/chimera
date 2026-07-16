"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutor = void 0;
const node_readline_1 = require("node:readline");
/**
 * Blocking prompt for an 'ask' decision. Returns 'allow' or 'deny'.
 * In non-interactive contexts (no TTY) default to 'deny' so automation
 * never silently approves a side-effecting action.
 */
function promptAsk(toolName) {
    if (!process.stdin.isTTY)
        return Promise.resolve('deny');
    const rl = (0, node_readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`Allow tool "${toolName}" to run? [y/N]: `, (line) => {
            rl.close();
            resolve(/^(y|yes)$/i.test(line.trim()) ? 'allow' : 'deny');
        });
    });
}
class ToolExecutor {
    registry;
    permissionCheck;
    permissionEngine;
    constructor(registry, permissionCheck, permissionEngine) {
        this.registry = registry;
        this.permissionCheck = permissionCheck;
        this.permissionEngine = permissionEngine;
    }
    /** Swap in a policy engine at startup (e.g. read-only mode toggle). */
    setPermissionEngine(engine) {
        this.permissionEngine = engine;
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
        // Check permission. A policy engine (if set) wins over the callback.
        const decision = this.permissionEngine
            ? this.permissionEngine.check(toolName, params)
            : this.permissionCheck(toolName, params);
        if (decision === 'deny') {
            return {
                success: false,
                error: `Permission denied for tool "${toolName}"`,
                duration: 0,
            };
        }
        if (decision === 'ask') {
            // Emit event requesting permission, then block on a real prompt.
            context.eventStream.append({
                type: 'tool_call_requested',
                call: { tool: toolName, args: params },
                policy: 'ask',
            });
            const granted = await promptAsk(toolName);
            if (granted !== 'allow') {
                return {
                    success: false,
                    error: `Permission denied for tool "${toolName}"`,
                    duration: 0,
                };
            }
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