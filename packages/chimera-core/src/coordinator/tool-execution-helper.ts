/**
 * `runToolCalls` — single shared helper that executes a batch of LLM-emitted
 * tool calls against the orchestrator's `ToolExecutorInterface`.
 *
 * This is the reused tool loop from the orchestrator's `executeToolCalls`
 * (session-orchestrator.ts). It is intentionally provider-agnostic: the
 * executors pass in an optional `toolExecutor`/`toolRegistry` and optional
 * `checkToolOutput` security check + `lintFile` edit-tool hook. The
 * orchestrator wires its real implementations; executors may pass `undefined`.
 *
 * Determinism / scope:
 *   - No new LLM calls. Pure tool side effects + events.
 *   - Security (`checkToolOutput`) and edit-tool linting are OPTIONAL and
 *     ported from session-orchestrator.ts (not copied — the real functions
 *     are injected by the orchestrator).
 */

import { EventStream } from '../event-stream.js';
import type {
  ToolExecutorInterface,
  ToolRegistryInterface,
} from '../session-orchestrator.js';
import type { ToolCall, ToolCallResult } from '../types/agent.js';

// Re-export the shared agent tool loop so callers can import from a single
// helper module (tool-execution-helper.js) if they prefer.
export {
  runAgentToolLoop,
  countSourceFiles,
  type RunAgentToolLoopParams,
  type RunAgentToolLoopResult,
  type AgentToolLoopMode,
  type LoopChatMessage,
} from './agent-tool-loop.js';

/** Shape of the security check injected by the orchestrator. */
export type ToolOutputCheck = (output: string, toolName?: string) => {
  safe: boolean;
  confidence: number;
  flags: string[];
};

/** Shape of the edit-tool linter hook injected by the orchestrator. */
export type LintFileFn = (path: string) => Promise<{ passed: boolean; errors: string[] }>;

export interface RunToolCallsParams {
  toolCalls: ToolCall[];
  toolExecutor: ToolExecutorInterface | null;
  /** Kept for API symmetry; executors may not need it directly. */
  toolRegistry?: ToolRegistryInterface | null;
  eventStream: EventStream;
  workspaceRoot: string;
  sessionId: string;
  signal?: AbortSignal;
  /** Optional prompt-injection guard (orchestrator passes `checkToolOutput`). */
  checkToolOutput?: ToolOutputCheck;
  /** Optional edit-tool linter (orchestrator passes its Biome linter). */
  lintFile?: LintFileFn;
}

/**
 * Execute each tool call and return a parallel-shaped result list, matching
 * the orchestrator's `executeToolCalls` contract exactly so results can be
 * handed to `buildToolResultMessages` downstream.
 */
export async function runToolCalls(
  params: RunToolCallsParams,
): Promise<Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }>> {
  const {
    toolCalls,
    toolExecutor,
    eventStream,
    workspaceRoot,
    sessionId,
    signal,
    checkToolOutput,
    lintFile,
  } = params;

  if (!toolExecutor || toolCalls.length === 0) {
    return toolCalls.map((tc) => ({
      toolName: tc.name,
      args: tc.arguments,
      result: {
        toolCallId: tc.id,
        toolName: tc.name,
        result: {
          success: false,
          error: toolExecutor ? 'No tool calls to execute' : 'No tool executor configured',
          duration: 0,
        },
      },
    }));
  }

  const EDIT_TOOLS = new Set(['edit', 'write', 'create_file']);
  const results: Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }> = [];

  for (const tc of toolCalls) {
    eventStream.append({
      type: 'tool_call_requested',
      call: { tool: tc.name, args: tc.arguments },
      policy: 'allow',
    } as Parameters<EventStream['append']>[0]);

    const result = await toolExecutor.execute(tc.name, tc.arguments, {
      workspaceRoot,
      sessionId,
      eventStream,
      signal,
    });

    // ── Security check (optional) ───────────────────────────────────
    if (result.success && result.data && checkToolOutput) {
      const outputCheck = checkToolOutput(JSON.stringify(result.data), tc.name);
      if (!outputCheck.safe && outputCheck.confidence > 0.8) {
        result.success = false;
        result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
        result.data = undefined;
      }
    }

    // ── Edit-tool lint (optional) ───────────────────────────────────
    if (result.success && EDIT_TOOLS.has(tc.name)) {
      const filePath = tc.arguments?.filePath as string | undefined;
      if (filePath && lintFile) {
        try {
          const lintResult = await lintFile(filePath);
          if (!lintResult.passed && lintResult.errors.length > 0) {
            eventStream.append({
              type: 'lint_warning',
              tool: tc.name,
              file: filePath,
              errors: lintResult.errors,
            } as any);
          }
        } catch {
          // Lint is best-effort
        }
      }
    }

    results.push({
      toolName: tc.name,
      args: tc.arguments,
      result: {
        toolCallId: tc.id,
        toolName: tc.name,
        result,
      },
    });
  }

  return results;
}
