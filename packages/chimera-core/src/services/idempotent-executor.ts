// =============================================================================
// IdempotentExecutor — wraps task execution with deduplication.
// Ensures the same task is not executed twice, even across process restarts.
// Uses a deduplication key derived from the task's identity.
// =============================================================================

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export interface IdempotentExecutorOptions {
  /** Directory to store execution records */
  recordDir: string;
  /** TTL for deduplication records (ms). After this, a task can be re-executed. */
  recordTtlMs?: number;
}

interface ExecutionRecord {
  taskId: string;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  executedAt: number;
  expiresAt: number;
}

const DEFAULT_OPTIONS = {
  recordTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * IdempotentExecutor — prevents duplicate task execution.
 * 
 * Before executing a task, checks if it has already been completed (or is
 * currently in-flight). If so, returns the cached result instead of re-running.
 * 
 * Deduplication keys are derived from a hash of the task's identity
 * (e.g. runId + task description + input hash).
 */
export class IdempotentExecutor {
  private readonly recordDir: string;
  private readonly ttlMs: number;

  constructor(options: IdempotentExecutorOptions) {
    this.recordDir = resolve(options.recordDir);
    this.ttlMs = options.recordTtlMs ?? DEFAULT_OPTIONS.recordTtlMs;
    mkdirSync(this.recordDir, { recursive: true });
  }

  /**
   * Generate a deterministic deduplication key for a task.
   * Tasks with the same key are considered identical.
   */
  static generateKey(input: {
    runId: string;
    taskDescription: string;
    inputHash?: string;
  }): string {
    const raw = `${input.runId}::${input.taskDescription}::${input.inputHash ?? ''}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Execute a function idempotently. If the task has already been completed,
   * returns the cached result. If it's currently in-flight, waits for it.
   * Otherwise, executes and records the result.
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      /** Force re-execution even if already completed */
      force?: boolean;
      /** Custom TTL for this specific record */
      ttlMs?: number;
    },
  ): Promise<T> {
    const ttl = options?.ttlMs ?? this.ttlMs;

    // Check for existing record
    if (!options?.force) {
      const existing = this.getRecord(key);
      if (existing) {
        if (existing.status === 'completed') {
          return existing.result as T;
        }
        if (existing.status === 'pending') {
          // Another execution is in-flight; wait for it
          return this.waitForCompletion(key, ttl);
        }
        // 'failed' — fall through to retry
      }
    }

    // Record pending execution
    this.writeRecord(key, { status: 'pending', executedAt: Date.now(), expiresAt: Date.now() + ttl });

    try {
      const result = await fn();
      this.writeRecord(key, {
        status: 'completed',
        result,
        executedAt: Date.now(),
        expiresAt: Date.now() + ttl,
      });
      return result;
    } catch (error) {
      this.writeRecord(key, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        executedAt: Date.now(),
        expiresAt: Date.now() + ttl,
      });
      throw error;
    }
  }

  /**
   * Check if a task has been completed successfully.
   */
  isCompleted(key: string): boolean {
    const record = this.getRecord(key);
    return record?.status === 'completed';
  }

  /**
   * Check if a task is currently in-flight.
   */
  isPending(key: string): boolean {
    const record = this.getRecord(key);
    return record?.status === 'pending';
  }

  /**
   * Get the cached result for a completed task, or undefined.
   */
  getCachedResult<T>(key: string): T | undefined {
    const record = this.getRecord(key);
    if (record?.status === 'completed') {
      return record.result as T;
    }
    return undefined;
  }

  /**
   * Invalidate a record so the task can be re-executed.
   */
  invalidate(key: string): boolean {
    const file = this.getRecordFile(key);
    if (!existsSync(file)) return false;
    try {
      const { unlinkSync } = require('node:fs') as typeof import('node:fs');
      unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired records.
   */
  cleanup(): number {
    if (!existsSync(this.recordDir)) return 0;
    const { readdirSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
    const files = readdirSync(this.recordDir).filter((f: string) => f.endsWith('.json'));
    let cleaned = 0;
    const now = Date.now();
    for (const file of files) {
      try {
        const content = readFileSync(resolve(this.recordDir, file), 'utf-8');
        const record = JSON.parse(content) as ExecutionRecord;
        if (record.expiresAt <= now) {
          unlinkSync(resolve(this.recordDir, file));
          cleaned++;
        }
      } catch {
        // Skip corrupted records
      }
    }
    return cleaned;
  }

  /**
   * Get the file path for a record.
   */
  private getRecordFile(key: string): string {
    return resolve(this.recordDir, `exec-${key}.json`);
  }

  /**
   * Read a record from disk.
   */
  private getRecord(key: string): ExecutionRecord | null {
    const file = this.getRecordFile(key);
    if (!existsSync(file)) return null;
    try {
      const content = readFileSync(file, 'utf-8');
      const record = JSON.parse(content) as ExecutionRecord;
      // Check TTL
      if (record.expiresAt <= Date.now()) {
        this.invalidate(key);
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Write a record to disk.
   */
  private writeRecord(key: string, partial: Omit<ExecutionRecord, 'taskId'>): void {
    const file = this.getRecordFile(key);
    const record: ExecutionRecord = { taskId: key, ...partial };
    writeFileSync(file, JSON.stringify(record), 'utf-8');
  }

  /**
   * Wait for a pending execution to complete.
   * Polls the record file until status changes or timeout.
   */
  private async waitForCompletion<T>(key: string, ttlMs: number): Promise<T> {
    const startTime = Date.now();
    const pollInterval = 100; // 100ms

    while (Date.now() - startTime < ttlMs) {
      const record = this.getRecord(key);
      if (record?.status === 'completed') {
        return record.result as T;
      }
      if (record?.status === 'failed') {
        throw new Error(record.error ?? 'Task failed');
      }
      if (!record) {
        throw new Error('Task record disappeared while waiting');
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error(`Timed out waiting for task ${key} to complete`);
  }
}
