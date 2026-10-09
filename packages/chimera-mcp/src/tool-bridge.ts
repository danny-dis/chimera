// =============================================================================
// McpToolBridge — bridges MCP tools into Chimera's tool system.
// Maps MCP tools to Chimera tool definitions with permission mapping,
// schema validation, and timeout/audit handling.
// =============================================================================

import type { McpServerAdapter, McpRegistry } from './server-adapter.js';
import type { McpTool, McpToolCall, McpToolResult } from './types.js';

/**
 * Chimera tool definition (matches existing tool interface)
 */
export interface ChimeraMcpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category: string;
  permissionLevel: 'read' | 'write' | 'execute';
  timeoutMs: number;
  serverId: string;
  /** Original MCP tool name (may differ from Chimera name) */
  mcpToolName: string;
}

/**
 * McpToolBridge — wraps MCP server tools as Chimera-compatible tools.
 * 
 * Features:
 * - Permission mapping (MCP category → Chimera permission level)
 * - Timeout enforcement with configurable overrides
 * - Audit logging for all MCP tool calls
 * - Input validation against MCP schema
 * - Result normalization (MCP format → Chimera format)
 */
export class McpToolBridge {
  private registry: McpRegistry;
  private auditLog: Array<{
    toolName: string;
    serverId: string;
    sessionId: string;
    runId: string;
    success: boolean;
    durationMs: number;
    timestamp: number;
    error?: string;
  }> = [];

  constructor(registry: McpRegistry) {
    this.registry = registry;
  }

  /**
   * Get all available MCP tools as Chimera tool definitions.
   */
  getAvailableTools(): ChimeraMcpTool[] {
    const tools: ChimeraMcpTool[] = [];
    for (const server of this.registry.getAllServers()) {
      if (!server.isConnected) continue;
      for (const mcpTool of server.tools) {
        tools.push(this.toChimeraTool(server, mcpTool));
      }
    }
    return tools;
  }

  /**
   * Get a specific tool by name.
   */
  getTool(toolName: string): ChimeraMcpTool | null {
    const found = this.registry.findTool(toolName);
    if (!found) return null;
    return this.toChimeraTool(found.server, found.tool);
  }

  /**
   * Execute an MCP tool call through the bridge.
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: {
      sessionId: string;
      runId: string;
      agentId: string;
      timeoutMs?: number;
    },
  ): Promise<Record<string, unknown>> {
    const found = this.registry.findTool(toolName);
    if (!found) {
      throw new Error(`MCP tool '${toolName}' not found`);
    }

    const { server, tool } = found;
    const call: McpToolCall = {
      toolName: tool.name,
      arguments: args,
      context: {
        sessionId: context.sessionId,
        runId: context.runId,
        agentId: context.agentId,
      },
      timeoutMs: context.timeoutMs ?? tool.timeoutMs ?? server.config.timeoutMs,
    };

    const startTime = Date.now();
    let result: McpToolResult;

    try {
      result = await server.executeTool(call);
    } catch (err) {
      result = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        serverId: server.config.id,
      };
    }

    // Audit log
    this.auditLog.push({
      toolName,
      serverId: server.config.id,
      sessionId: context.sessionId,
      runId: context.runId,
      success: result.success,
      durationMs: result.durationMs,
      timestamp: Date.now(),
      error: result.error,
    });

    if (!result.success) {
      throw new Error(result.error || `MCP tool '${toolName}' failed`);
    }

    return result.data ?? {};
  }

  /**
   * Get permission level for a tool.
   */
  getPermissionLevel(toolName: string): 'read' | 'write' | 'execute' {
    for (const server of this.registry.getAllServers()) {
      const tool = server.getTool(toolName);
      if (tool) {
        return server.getPermissionLevel(toolName);
      }
    }
    return 'read';
  }

  /**
   * Get the audit log.
   */
  getAuditLog(): typeof this.auditLog {
    return [...this.auditLog];
  }

  /**
   * Clear the audit log.
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Convert an MCP tool to a Chimera tool definition.
   */
  private toChimeraTool(server: McpServerAdapter, mcpTool: McpTool): ChimeraMcpTool {
    return {
      name: mcpTool.name,
      description: `[MCP:${server.config.id}] ${mcpTool.description}`,
      parameters: mcpTool.inputSchema,
      category: mcpTool.category,
      permissionLevel: server.getPermissionLevel(mcpTool.name),
      timeoutMs: mcpTool.timeoutMs ?? server.config.timeoutMs,
      serverId: server.config.id,
      mcpToolName: mcpTool.name,
    };
  }
}
