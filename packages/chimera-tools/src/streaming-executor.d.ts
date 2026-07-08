/**
 * StreamingToolExecutor — parallel tool dispatch with streaming support.
 *
 * Executes multiple independent tool calls concurrently, respecting
 * concurrency limits and tool-specific constraints. Supports streaming
 * results as they complete.
 */
import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';
export type PermissionChecker = (tool: string, params: Record<string, unknown>) => PermissionDecision;
export interface ToolCallRequest {
    id: string;
    toolName: string;
    params: Record<string, unknown>;
}
export interface ToolCallResult extends ToolResult {
    callId: string;
    toolName: string;
}
export interface StreamingOptions {
    /** Maximum concurrent tool executions (default: 8) */
    maxConcurrency?: number;
    /** Per-tool timeout in ms (default: 60000) */
    timeout?: number;
    /** Called as each tool completes */
    onResult?: (result: ToolCallResult) => void;
    /** Called on error for a specific tool call */
    onError?: (callId: string, error: Error) => void;
}
export declare class StreamingToolExecutor {
    private registry;
    private permissionCheck;
    private maxConcurrency;
    private activeCount;
    constructor(registry: ToolRegistry, permissionCheck: PermissionChecker, options?: {
        maxConcurrency?: number;
    });
    /**
     * Execute a batch of tool calls in parallel, returning results as they complete.
     * Returns a promise that resolves when ALL calls are done.
     */
    executeAll(calls: ToolCallRequest[], context: ToolContext, options?: StreamingOptions): Promise<ToolCallResult[]>;
    /**
     * Execute a single tool call with timeout and error handling.
     */
    executeOne(call: ToolCallRequest, context: ToolContext, options?: StreamingOptions): Promise<ToolCallResult>;
    /**
     * Execute a batch of calls with concurrency limiting.
     */
    private executeBatch;
}
//# sourceMappingURL=streaming-executor.d.ts.map