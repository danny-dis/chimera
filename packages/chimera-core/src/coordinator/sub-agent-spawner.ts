import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';
import { AsyncSemaphore } from '../agent/async-semaphore.js';
import { DynamicConcurrencyEngine, type ConcurrencyOverrides } from '../agent/dynamic-concurrency-engine.js';
import { EventStream } from '../event-stream.js';
import type { ProviderConfig } from '@chimera/providers';
import { runToolCalls } from './tool-execution-helper.js';
import type { ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';

const DEFAULT_LAUNCH_STAGGER_MS = 100;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrency: 4,
  taskTimeoutMs: 60_000,
  conflictResolution: 'auto',
  staggerDelayMs: 0,
};

interface RateLimitState {
  retryAfterMs: number;
  backoffMs: number;
  resetsAt: number;
}

export interface SpawnerBackoffConfig {
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxRetries?: number;
}

/**
 * Executes sub-tasks in parallel with dynamic concurrency control,
 * rate-limit backoff, and timeout handling.
 */
export class SubAgentSpawner {
  private config: CoordinatorConfig;
  private eventStream?: EventStream;
  private concurrencyEngine?: DynamicConcurrencyEngine;
  private rateLimitStates: Map<string, RateLimitState> = new Map();
  private toolExecutor?: ToolExecutorInterface;
  private toolRegistry?: ToolRegistryInterface;
  private workspaceRoot?: string;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private maxRetries: number;

  constructor(
    eventStreamOrConfig?: EventStream | Partial<CoordinatorConfig>,
    config?: Partial<CoordinatorConfig>,
    concurrencyEngine?: DynamicConcurrencyEngine,
    backoffConfig?: SpawnerBackoffConfig,
    toolDeps?: { toolExecutor?: ToolExecutorInterface; toolRegistry?: ToolRegistryInterface; workspaceRoot?: string },
  ) {
    if (eventStreamOrConfig && typeof (eventStreamOrConfig as EventStream).append === 'function') {
      this.eventStream = eventStreamOrConfig as EventStream;
      this.config = { ...DEFAULT_CONFIG, ...config };
    } else {
      this.config = { ...DEFAULT_CONFIG, ...(eventStreamOrConfig as Partial<CoordinatorConfig>) };
    }
    this.concurrencyEngine = concurrencyEngine;
    this.toolExecutor = toolDeps?.toolExecutor;
    this.toolRegistry = toolDeps?.toolRegistry;
    this.workspaceRoot = toolDeps?.workspaceRoot;
    this.baseBackoffMs = backoffConfig?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs = backoffConfig?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.maxRetries = backoffConfig?.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Execute all sub-tasks respecting dependencies and concurrency limits.
   */
  async executeAll(
    subTasks: SubTask[],
    options?: { providerConfig?: ProviderConfig; overrides?: ConcurrencyOverrides },
  ): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];
    const concurrency = this.concurrencyEngine
      ? this.concurrencyEngine.getSuggestedConcurrency(options?.providerConfig, options?.overrides, subTasks.length)
      : this.config.maxConcurrency;
    const semaphore = new AsyncSemaphore(concurrency);
    const completed = new Set<string>();
    const launched = new Set<string>();

    const tasks = [...subTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const runTask = async (task: SubTask): Promise<void> => {
      while (!task.dependencies.every((dep) => completed.has(dep))) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await semaphore.acquire();
      try {
        if (this.config.staggerDelayMs && this.config.staggerDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.config.staggerDelayMs));
        }
        const result = await this.executeWithBackoff(task);
        results.push(result);
      } finally {
        semaphore.release();
        completed.add(task.id);
      }
    };

    while (launched.size < tasks.length) {
      const ready = tasks.filter((t) => !launched.has(t.id));
      for (let i = 0; i < ready.length; i++) {
        const task = ready[i];
        launched.add(task.id);
        runTask(task);
        if (i < ready.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DEFAULT_LAUNCH_STAGGER_MS));
        }
      }
      if (ready.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const MAX_WAIT_MS = 5 * 60 * 1000;
    const startTime = Date.now();
    while (completed.size < tasks.length) {
      if (Date.now() - startTime > MAX_WAIT_MS) {
        throw new Error(
          `Sub-agent execution timed out after ${MAX_WAIT_MS / 1000}s. ` +
          `${completed.size}/${tasks.length} tasks completed.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return results;
  }

  private async executeWithBackoff(task: SubTask): Promise<SubTaskResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = this.calculateBackoff(task, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      const result = await this.executeOne(task);
      if (result.status !== 'error' || !this.isRateLimitError(result.error)) {
        return result;
      }

      lastError = new Error(result.error);
      this.handleRateLimit(task, attempt);
    }

    return {
      subTaskId: task.id,
      status: 'error',
      output: '',
      tokensUsed: 0,
      error: `Rate limited after ${this.maxRetries} retries: ${lastError?.message}`,
      durationMs: 0,
    };
  }

  private async executeOne(task: SubTask): Promise<SubTaskResult> {
    const start = Date.now();

    try {
      // System prompt — append a tool-use directive when this sub-task
      // carries tool definitions (file-writing tasks). This is what makes
      // hive sub-agents emit write_file/edit_file tool_calls instead of
      // narrating code as text.
      let systemContent =
        '[!] #CORE SUB-AGENT DIRECTIVE# [!]\n>>> FOCUS: ATOMIC TASK EXECUTION <<<\n\nIDENTITY: You are a specialized sub-agent. Your existence is dedicated to the precise execution of the assigned sub-task.\n\n# MANDATES #\n1. PRECISION: Complete the sub-task EXACTLY as described. \n2. BREVITY: Output ONLY the result. NO preamble. NO filler. NO explanations. \n3. INTEGRITY: If the context is insufficient, state "INSUFFICIENT CONTEXT" and list requirements.';
      if (task.tools && task.tools.length > 0) {
        // When file tools are present, writing the file IS the result. The
        // BREVITY mandate above must NOT be read as "print code as text" —
        // that would land nothing on disk. Make the file write mandatory.
        systemContent =
          '[!] #CORE SUB-AGENT DIRECTIVE# [!]\n>>> FOCUS: ATOMIC TASK EXECUTION <<<\n\nIDENTITY: You are a specialized sub-agent. Your existence is dedicated to the precise execution of the assigned sub-task.\n\n# MANDATES #\n1. PRECISION: Complete the sub-task EXACTLY as described. \n2. INTEGRITY: If the context is insufficient, state "INSUFFICIENT CONTEXT" and list requirements.\n\n# TOOL USE (MANDATORY) #\nYou have file tools (write_file / edit_file / read_file). When the task requires creating or editing a file, you MUST call write_file (or edit_file) with the exact path and the FULL file content. This is the ONLY way the file reaches disk — never output file contents as text, never summarize the code, never describe what you would write. The task is complete ONLY when the file exists on disk. After the tool returns success, output a one-line confirmation (e.g. "Wrote greeter.js").';
      }

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemContent },
        {
          role: 'user',
          content: task.context
            ? `TASK: ${task.description}\n\n<CONTEXT_RESOURCES>\n${task.context}\n</CONTEXT_RESOURCES>`
            : `TASK: ${task.description}`,
        },
      ];

      const options: Record<string, unknown> = { temperature: 0.3 };
      if (task.tools && task.tools.length > 0) {
        options.tools = task.tools;
        options.toolChoice = 'auto';
      }

      // Bounded tool loop: call → execute tools → feed results back.
      const MAX_TOOL_ROUNDS = 3;
      let result: any;
      let lastAssistant: any;
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        result = await this.withTimeout(task.provider.complete(messages as any, options as any), this.config.taskTimeoutMs);
        const toolCalls: Array<{ id: string; name: string; arguments: unknown }> = result?.toolCalls ?? [];
        if (toolCalls.length === 0) break;

        // Record assistant message (with tool_calls) for the follow-up turn.
        lastAssistant = {
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
        messages.push(lastAssistant as any);

        // Execute the tool calls against the workspace (if executor wired).
        if (this.toolExecutor && this.workspaceRoot) {
          const toolResults = await runToolCalls({
            toolCalls: result.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments })),
            toolExecutor: this.toolExecutor,
            toolRegistry: this.toolRegistry ?? null,
            eventStream: this.eventStream!,
            workspaceRoot: this.workspaceRoot,
            sessionId: `hive-${task.id}`,
          });
          for (const tr of toolResults) {
            messages.push({
              role: 'tool',
              content: JSON.stringify(tr.result),
            } as any);
          }
        } else {
          // No executor wired — record the request but cannot act.
          for (const tc of result.toolCalls) {
            messages.push({ role: 'tool', content: JSON.stringify({ toolCallId: tc.id, toolName: tc.name, result: { success: false, error: 'No tool executor configured' } }) } as any);
          }
        }
      }

      return {
        subTaskId: task.id,
        status: 'success',
        output: result.content,
        tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        subTaskId: task.id,
        status: err instanceof TimeoutError ? 'timeout' : 'error',
        output: '',
        tokensUsed: 0,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private isRateLimitError(error?: string): boolean {
    if (!error) return false;
    const lower = error.toLowerCase();
    return lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests');
  }

  private handleRateLimit(task: SubTask, attempt: number): void {
    const providerId = task.provider.constructor?.name ?? 'unknown';
    const state = this.rateLimitStates.get(providerId);
    const backoffMs = state
      ? Math.min(state.backoffMs * 2, this.maxBackoffMs)
      : this.baseBackoffMs * Math.pow(2, attempt);

    this.rateLimitStates.set(providerId, {
      retryAfterMs: backoffMs,
      backoffMs,
      resetsAt: Date.now() + backoffMs,
    });

    this.eventStream?.append({
      type: 'provider_rate_limited',
      providerId,
      retryAfterMs: backoffMs,
      remainingRpm: 0,
    });
  }

  private calculateBackoff(task: SubTask, attempt: number): number {
    const providerId = task.provider.constructor?.name ?? 'unknown';
    const state = this.rateLimitStates.get(providerId);

    if (state && Date.now() < state.resetsAt) {
      return state.resetsAt - Date.now();
    }

    return Math.min(this.baseBackoffMs * Math.pow(2, attempt - 1), this.maxBackoffMs);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(`Task timed out after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
