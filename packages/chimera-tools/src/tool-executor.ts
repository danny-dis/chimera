import { createInterface } from 'node:readline';
import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';
import type { PermissionEngine } from './permission/policy.js';

export type PermissionChecker = (
  tool: string,
  params: Record<string, unknown>,
) => PermissionDecision;

/**
 * Blocking prompt for an 'ask' decision. Returns 'allow' or 'deny'.
 * In non-interactive contexts (no TTY) default to 'deny' so automation
 * never silently approves a side-effecting action.
 */
function promptAsk(toolName: string): Promise<PermissionDecision> {
  if (!process.stdin.isTTY) return Promise.resolve('deny');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Allow tool "${toolName}" to run? [y/N]: `, (line) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(line.trim()) ? 'allow' : 'deny');
    });
  });
}

export class ToolExecutor {
  private registry: ToolRegistry;
  private permissionCheck: PermissionChecker;
  private permissionEngine?: PermissionEngine;

  constructor(
    registry: ToolRegistry,
    permissionCheck: PermissionChecker,
    permissionEngine?: PermissionEngine,
  ) {
    this.registry = registry;
    this.permissionCheck = permissionCheck;
    this.permissionEngine = permissionEngine;
  }

  /** Swap in a policy engine at startup (e.g. read-only mode toggle). */
  setPermissionEngine(engine: PermissionEngine): void {
    this.permissionEngine = engine;
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
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
    const decision: PermissionDecision = this.permissionEngine
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
