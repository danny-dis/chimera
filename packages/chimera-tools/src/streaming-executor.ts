/**
 * StreamingToolExecutor — parallel tool dispatch with streaming support.
 *
 * Executes multiple independent tool calls concurrently, respecting
 * concurrency limits and tool-specific constraints. Supports streaming
 * results as they complete.
 */

import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';

export type PermissionChecker = (
  tool: string,
  params: Record<string, unknown>,
) => PermissionDecision;

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

export class StreamingToolExecutor {
  private registry: ToolRegistry;
  private permissionCheck: PermissionChecker;
  private maxConcurrency: number;
  private activeCount = 0;

  constructor(
    registry: ToolRegistry,
    permissionCheck: PermissionChecker,
    options?: { maxConcurrency?: number },
  ) {
    this.registry = registry;
    this.permissionCheck = permissionCheck;
    this.maxConcurrency = options?.maxConcurrency ?? 8;
  }

  /**
   * Execute a batch of tool calls in parallel, returning results as they complete.
   * Returns a promise that resolves when ALL calls are done.
   */
  async executeAll(
    calls: ToolCallRequest[],
    context: ToolContext,
    options?: StreamingOptions,
  ): Promise<ToolCallResult[]> {
    // Validate all calls upfront
    const validated = calls.map((call) => {
      const tool = this.registry.get(call.toolName);
      if (!tool) {
        return {
          ...call,
          error: new Error(`Tool "${call.toolName}" not found`),
        };
      }

      // Check permission
      const decision = this.permissionCheck(call.toolName, call.params);
      if (decision === 'deny') {
        return {
          ...call,
          error: new Error(`Permission denied for tool "${call.toolName}"`),
        };
      }

      if (decision === 'ask') {
        context.eventStream.append({
          type: 'tool_call_requested',
          call: { tool: call.toolName, args: call.params },
          policy: decision,
        });
        return {
          ...call,
          error: new Error(`Permission pending (${decision}) for tool "${call.toolName}"`),
        };
      }

      // Parse params with defaults
      try {
        const parsed = tool.parameters.parse(call.params);
        return { ...call, parsedParams: parsed as Record<string, unknown> };
      } catch (err) {
        return {
          ...call,
          error: new Error(`Invalid params: ${err instanceof Error ? err.message : String(err)}`),
        };
      }
    });

    // Separate valid calls from errors
    const results: ToolCallResult[] = [];
    const validCalls: Array<ToolCallRequest & { parsedParams: Record<string, unknown> }> = [];

    for (const v of validated) {
      if ('error' in v) {
        results.push({
          callId: v.id,
          toolName: v.toolName,
          success: false,
          error: (v as { error: Error }).error.message,
          duration: 0,
        });
        options?.onError?.(v.id, (v as { error: Error }).error);
      } else {
        validCalls.push(v as ToolCallRequest & { parsedParams: Record<string, unknown> });
      }
    }

    // Execute valid calls in parallel with concurrency limit
    const batchResults = await this.executeBatch(validCalls, context, options);
    results.push(...batchResults);

    return results;
  }

  /**
   * Execute a single tool call with timeout and error handling.
   */
  async executeOne(
    call: ToolCallRequest,
    context: ToolContext,
    options?: StreamingOptions,
  ): Promise<ToolCallResult> {
    const tool = this.registry.get(call.toolName);
    if (!tool) {
      const result: ToolCallResult = {
        callId: call.id,
        toolName: call.toolName,
        success: false,
        error: `Tool "${call.toolName}" not found`,
        duration: 0,
      };
      options?.onError?.(call.id, new Error(result.error));
      return result;
    }

    // Permission check
    const decision = this.permissionCheck(call.toolName, call.params);
    if (decision === 'deny' || decision === 'ask') {
      const msg = decision === 'deny'
        ? `Permission denied for tool "${call.toolName}"`
        : `Permission pending (${decision}) for tool "${call.toolName}"`;
      if (decision !== 'deny') {
        context.eventStream.append({
          type: 'tool_call_requested',
          call: { tool: call.toolName, args: call.params },
          policy: decision,
        });
      }
      const result: ToolCallResult = {
        callId: call.id,
        toolName: call.toolName,
        success: false,
        error: msg,
        duration: 0,
      };
      options?.onError?.(call.id, new Error(msg));
      return result;
    }

    // Pre-execution hook
    let params = call.params;
    if (tool.preExecution) {
      const modified = await tool.preExecution(params as never, context);
      if (modified === null) {
        // Tool cancelled by pre-execution hook
        return {
          callId: call.id,
          toolName: call.toolName,
          success: false,
          error: 'Tool execution cancelled by pre-execution hook',
          duration: 0,
        };
      }
      params = modified as Record<string, unknown>;
    }

    // Execute with timeout
    const timeout = options?.timeout ?? tool.timeout ?? 60_000;
    const startTime = Date.now();

    try {
      const data = await Promise.race([
        tool.execute(params as never, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${call.toolName}" timed out after ${timeout}ms`)), timeout)
        ),
      ]);

      let result: ToolCallResult = {
        callId: call.id,
        toolName: call.toolName,
        success: true,
        data: data as Record<string, unknown>,
        duration: Date.now() - startTime,
      };

      // Post-execution hook
      if (tool.postExecution) {
        const modified = await tool.postExecution(data as never, {} as never, context);
        result = {
          ...result,
          data: modified as Record<string, unknown>,
        };
      }

      // Emit event
      context.eventStream.append({
        type: 'tool_call_result',
        result: {
          tool: call.toolName,
          output: JSON.stringify(result.data),
          exitCode: 0,
        },
      });

      options?.onResult?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Error hook
      if (tool.onError) {
        const handled = await tool.onError(error, params as never, context);
        if (handled === null) {
          // Error suppressed
          return {
            callId: call.id,
            toolName: call.toolName,
            success: false,
            error: 'Error suppressed by onError hook',
            duration: Date.now() - startTime,
          };
        }
      }

      // Retry logic
      const maxRetries = tool.maxRetries ?? 0;
      const retryableErrors = tool.retryableErrors ?? [];
      const isRetryable = retryableErrors.some((pattern) => error.message.includes(pattern));

      if (maxRetries > 0 && isRetryable) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const data = await tool.execute(params as never, context);
            const result: ToolCallResult = {
              callId: call.id,
              toolName: call.toolName,
              success: true,
              data: data as Record<string, unknown>,
              duration: Date.now() - startTime,
            };
            options?.onResult?.(result);
            return result;
          } catch {
            if (attempt === maxRetries) break;
          }
        }
      }

      const result: ToolCallResult = {
        callId: call.id,
        toolName: call.toolName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };

      context.eventStream.append({
        type: 'tool_call_result',
        result: {
          tool: call.toolName,
          output: error.message,
          exitCode: 1,
        },
      });

      options?.onError?.(call.id, error);
      return result;
    }
  }

  /**
   * Execute a batch of calls with concurrency limiting.
   */
  private async executeBatch(
    calls: Array<ToolCallRequest & { parsedParams: Record<string, unknown> }>,
    context: ToolContext,
    options?: StreamingOptions,
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    const executing = new Set<Promise<void>>();

    for (const call of calls) {
      // Wait if at concurrency limit
      while (this.activeCount >= this.maxConcurrency) {
        await Promise.race(executing);
      }

      this.activeCount++;
      const promise = this.executeOne(
        { ...call, params: call.parsedParams },
        context,
        options,
      ).then((result) => {
        results.push(result);
        this.activeCount--;
        executing.delete(promise);
      }).catch((error) => {
        results.push({
          callId: call.id,
          toolName: call.toolName,
          success: false,
          error: error.message,
          duration: 0,
        });
        this.activeCount--;
        executing.delete(promise);
      });

      executing.add(promise);
    }

    // Wait for all remaining
    await Promise.all(executing);
    return results;
  }
}
