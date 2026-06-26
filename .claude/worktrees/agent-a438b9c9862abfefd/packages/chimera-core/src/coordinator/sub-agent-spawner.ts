import type { SubTask, SubTaskResult, CoordinatorConfig } from './types.js';

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrency: 4,
  taskTimeoutMs: 60_000,
  conflictResolution: 'auto',
};

/**
 * Executes sub-tasks in parallel with concurrency control and timeout.
 */
export class SubAgentSpawner {
  private config: CoordinatorConfig;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute all sub-tasks respecting dependencies and concurrency limits.
   */
  async executeAll(subTasks: SubTask[]): Promise<SubTaskResult[]> {
    const results: SubTaskResult[] = [];
    const completed = new Set<string>();
    const inProgress = new Map<string, Promise<SubTaskResult>>();

    // Build dependency graph
    const remaining = [...subTasks];

    while (remaining.length > 0 || inProgress.size > 0) {
      // Find tasks whose dependencies are all met
      const ready = remaining.filter(
        (st) =>
          st.dependencies.every((dep) => completed.has(dep)) &&
          !inProgress.has(st.id),
      );

      // Launch up to maxConcurrency tasks
      const toLaunch = ready.slice(0, this.config.maxConcurrency - inProgress.size);
      for (const task of toLaunch) {
        const idx = remaining.indexOf(task);
        if (idx !== -1) remaining.splice(idx, 1);
        inProgress.set(task.id, this.executeOne(task));
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        const result = await Promise.race(inProgress.values());
        // Find and remove the completed promise
        for (const [id, promise] of inProgress) {
          const resolved = await Promise.race([promise, Promise.resolve(null)]);
          if (resolved !== null && resolved.subTaskId === result.subTaskId) {
            inProgress.delete(id);
            break;
          }
        }
        results.push(result);
        completed.add(result.subTaskId);
      }
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
