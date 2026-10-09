import { EventStream } from '../event-stream.js';
import { CostTracker } from '../cost-tracker.js';
import type { ToolPermission } from '../types/tool-permission.js';

export interface ToolRegistryLike {
  get(name: string): ToolDefinitionLike | undefined;
  getAll(): ToolDefinitionLike[];
  has(name: string): boolean;
  register(tool: ToolDefinitionLike): void;
}

export interface ToolDefinitionLike {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>, context: ToolContextLike) => Promise<unknown>;
  permissionLevel: string;
  isDestructive?: (params: Record<string, unknown>, context: ToolContextLike) => boolean;
}

export interface ToolContextLike {
  workspaceRoot: string;
  sessionId: string;
  eventStream: EventStream;
  costTracker: CostTracker;
  permissionCheck: (tool: string, params: Record<string, unknown>) => ToolPermission;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  agentId: string;
  runId: string;
  timestamp: number;
}

export interface ToolCallRecord {
  call: ToolCall;
  result: ToolResult;
  permission: ToolPermission;
}

/**
 * ToolController — domain wrapper around a tool registry and executor.
 * Accepts registry/executor via dependency injection to avoid circular deps
 * (@chimera/tools already imports types from @chimera/core).
 */
export class ToolController {
  private registry: ToolRegistryLike | null = null;
  private eventStream: EventStream;
  private costTracker: CostTracker;
  private workspaceRoot: string;
  private history: ToolCallRecord[] = [];

  constructor(opts?: {
    eventStream?: EventStream;
    costTracker?: CostTracker;
    workspaceRoot?: string;
    registry?: ToolRegistryLike;
  }) {
    this.eventStream = opts?.eventStream ?? new EventStream();
    this.costTracker = opts?.costTracker ?? new CostTracker(this.eventStream);
    this.workspaceRoot = opts?.workspaceRoot ?? process.cwd();
    this.registry = opts?.registry ?? null;
  }

  /**
   * Set the tool registry (dependency injection).
   */
  setRegistry(registry: ToolRegistryLike): void {
    this.registry = registry;
  }

  /**
   * Register a tool definition.
   */
  registerTool(tool: ToolDefinitionLike): void {
    this.registry?.register(tool);
  }

  /**
   * Get available tool names, optionally filtered by role.
   */
  getAvailableTools(role?: string): string[] {
    if (!this.registry) return [];
    const all = this.registry.getAll();
    if (!role) return all.map((t) => t.name);
    // Role-based filtering: map roles to permission levels
    const rolePermissionMap: Record<string, string[]> = {
      writer: ['read', 'write'],
      reviewer: ['read'],
      challenger: ['read'],
      planner: ['read'],
      explorer: ['read'],
      implementer: ['read', 'write', 'execute'],
      debugger: ['read', 'write', 'execute'],
      tester: ['read', 'write', 'execute'],
      'security-reviewer': ['read'],
      synthesizer: ['read'],
      researcher: ['read'],
      summarizer: ['read'],
    };
    const allowed = rolePermissionMap[role] ?? ['read', 'write'];
    return all.filter((t) => allowed.includes(t.permissionLevel)).map((t) => t.name);
  }

  /**
   * Get permission decision for a tool call.
   */
  getToolPermission(toolName: string, args: Record<string, unknown>): ToolPermission {
    if (!this.registry) return 'deny';
    const tool = this.registry.get(toolName);
    if (!tool) return 'deny';
    // Destructive tools require explicit approval
    if (tool.isDestructive?.(args, this.createToolContext())) {
      return 'ask';
    }
    // Execute-level tools require approval
    if (tool.permissionLevel === 'execute') {
      return 'ask';
    }
    return 'allow';
  }

  /**
   * Execute a tool call.
   */
  async executeTool(call: ToolCall): Promise<ToolResult> {
    if (!this.registry) {
      return { success: false, error: 'No tool registry configured', duration: 0 };
    }
    const tool = this.registry.get(call.toolName);
    if (!tool) {
      return { success: false, error: `Tool "${call.toolName}" not found`, duration: 0 };
    }

    const context = this.createToolContext();
    const permission = this.getToolPermission(call.toolName, call.args);

    if (permission === 'deny') {
      const result: ToolResult = {
        success: false,
        error: `Permission denied for tool "${call.toolName}"`,
        duration: 0,
      };
      this.history.push({ call, result, permission });
      return result;
    }

    const startTime = Date.now();
    this.eventStream.append({
      type: 'tool_call_requested',
      call: { tool: call.toolName, args: call.args },
      policy: permission,
    } as any);

    try {
      const rawResult = await tool.execute(call.args, context);
      const duration = Date.now() - startTime;
      const result: ToolResult = {
        success: true,
        data: rawResult as Record<string, unknown>,
        duration,
      };
      this.history.push({ call, result, permission });
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const result: ToolResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration,
      };
      this.history.push({ call, result, permission });
      return result;
    }
  }

  /**
   * Get tool call history.
   */
  getToolCallHistory(): ToolCallRecord[] {
    return [...this.history];
  }

  /**
   * Check if a tool exists.
   */
  hasTool(toolName: string): boolean {
    return this.registry?.has(toolName) ?? false;
  }

  /**
   * Get a tool definition.
   */
  getTool(toolName: string): ToolDefinitionLike | undefined {
    return this.registry?.get(toolName);
  }

  private createToolContext(): ToolContextLike {
    return {
      workspaceRoot: this.workspaceRoot,
      sessionId: 'session-unknown',
      eventStream: this.eventStream,
      costTracker: this.costTracker,
      permissionCheck: (tool: string, params: Record<string, unknown>) =>
        this.getToolPermission(tool, params),
    };
  }
}
