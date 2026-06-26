import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';

export type PermissionChecker = (
  tool: string,
  params: Record<string, unknown>,
) => PermissionDecision;

export class ToolExecutor {
  private registry: ToolRegistry;
  private permissionCheck: PermissionChecker;

  constructor(registry: ToolRegistry, permissionCheck: PermissionChecker) {
    this.registry = registry;
    this.permissionCheck = permissionCheck;
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

    // Validate params
    const validation = this.registry.validateParams(toolName, params);
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
    const result = await this.registry.execute(toolName, params, context);

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
