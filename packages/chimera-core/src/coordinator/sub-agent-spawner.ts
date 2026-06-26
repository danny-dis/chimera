import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';
import { AsyncSemaphore } from '../agent/async-semaphore.js';
import { EventStream } from '../event-stream.js';

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrency: 4,
  taskTimeoutMs: 60_000,
  conflictResolution: 'auto',
  staggerDelayMs: 0,
};

/**
 * Executes sub-tasks in parallel with concurrency control and timeout.
 */
export class SubAgentSpawner {
  private config: CoordinatorConfig;

  constructor(eventStreamOrConfig?: EventStream | Partial<CoordinatorConfig>, config?: Partial<CoordinatorConfig>) {
    if (eventStreamOrConfig instanceof EventStream) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    } else {
        this.config = { ...DEFAULT_CONFIG, ...(eventStreamOrConfig as Partial<CoordinatorConfig>) };
    }
  }

  /**
   * Execute all sub-tasks respecting dependencies and concurrency limits.
   */
  async executeAll(subTasks: SubTask[]): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];
    const semaphore = new AsyncSemaphore(this.config.maxConcurrency);
    const completed = new Set<string>();
    const launched = new Set<string>();

    // Sort tasks by priority (higher first)
    const tasks = [...subTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const runTask = async (task: SubTask): Promise<void> => {
      // Wait for dependencies
      while (!task.dependencies.every((dep) => completed.has(dep))) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await semaphore.acquire();
      
      try {
        if (this.config.staggerDelayMs && this.config.staggerDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.config.staggerDelayMs));
        }
        
        const result = await this.executeOne(task);
        results.push(result);
      } finally {
        semaphore.release();
        completed.add(task.id);
      }
    };

    // Keep launching until all tasks are launched
    while (launched.size < tasks.length) {
      const ready = tasks.filter((t) => !launched.has(t.id));
      for (const task of ready) {
        launched.add(task.id);
        runTask(task); // fire-and-forget, semaphore handles concurrency
      }
      // Wait a bit before checking for more tasks
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Wait for all to complete with a timeout
    const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
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
        tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
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
