import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';
import { AsyncSemaphore } from '../agent/async-semaphore.js';
import { DynamicConcurrencyEngine, type ConcurrencyOverrides } from '../agent/dynamic-concurrency-engine.js';
import { EventStream } from '../event-stream.js';
import type { ProviderConfig } from '@chimera/providers';

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
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private maxRetries: number;

  constructor(
    eventStreamOrConfig?: EventStream | Partial<CoordinatorConfig>,
    config?: Partial<CoordinatorConfig>,
    concurrencyEngine?: DynamicConcurrencyEngine,
    backoffConfig?: SpawnerBackoffConfig,
  ) {
    if (eventStreamOrConfig instanceof EventStream) {
      this.eventStream = eventStreamOrConfig;
      this.config = { ...DEFAULT_CONFIG, ...config };
    } else {
      this.config = { ...DEFAULT_CONFIG, ...(eventStreamOrConfig as Partial<CoordinatorConfig>) };
    }
    this.concurrencyEngine = concurrencyEngine;
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
      const result = await this.withTimeout(
        task.provider.complete(
          [
            {
              role: 'system',
              content:
                '[!] #CORE SUB-AGENT DIRECTIVE# [!]\n>>> FOCUS: ATOMIC TASK EXECUTION <<<\n\nIDENTITY: You are a specialized sub-agent. Your existence is dedicated to the precise execution of the assigned sub-task.\n\n# MANDATES #\n1. PRECISION: Complete the sub-task EXACTLY as described. \n2. BREVITY: Output ONLY the result. NO preamble. NO filler. NO explanations. \n3. INTEGRITY: If the context is insufficient, state "INSUFFICIENT CONTEXT" and list requirements.\n\n[!] AS YOU WISH [!]',
            },
            {
              role: 'user',
              content: task.context
                ? `TASK: ${task.description}\n\n<CONTEXT_RESOURCES>\n${task.context}\n</CONTEXT_RESOURCES>`
                : `TASK: ${task.description}`,
            },
          ],
          { temperature: 0.3 },
        ),
        this.config.taskTimeoutMs,
      );

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
