import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IdempotentExecutor } from './idempotent-executor.js';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('IdempotentExecutor', () => {
  let dir: string;
  let executor: IdempotentExecutor;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'idempotent-'));
    executor = new IdempotentExecutor({ recordDir: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('executes a function and caches the result', async () => {
    let calls = 0;
    const fn = async () => { calls++; return 'result'; };
    const result = await executor.execute('key-1', fn);
    expect(result).toBe('result');
    expect(calls).toBe(1);
  });

  it('returns cached result on second call with same key', async () => {
    let calls = 0;
    const fn = async () => { calls++; return 'cached'; };
    await executor.execute('key-1', fn);
    const result = await executor.execute('key-1', fn);
    expect(result).toBe('cached');
    expect(calls).toBe(1); // Function not called again
  });

  it('executes again with force=true', async () => {
    let calls = 0;
    const fn = async () => { calls++; return 'result'; };
    await executor.execute('key-1', fn);
    await executor.execute('key-1', fn, { force: true });
    expect(calls).toBe(2);
  });

  it('checks if a task is completed', async () => {
    await executor.execute('key-1', async () => 'done');
    expect(executor.isCompleted('key-1')).toBe(true);
    expect(executor.isCompleted('key-2')).toBe(false);
  });

  it('checks if a task is pending', () => {
    // Can't easily test isPending without mocking, but we can check initial state
    expect(executor.isPending('nonexistent')).toBe(false);
  });

  it('gets cached result', async () => {
    await executor.execute('key-1', async () => 'value');
    expect(executor.getCachedResult('key-1')).toBe('value');
    expect(executor.getCachedResult('key-2')).toBeUndefined();
  });

  it('invalidates a record', async () => {
    await executor.execute('key-1', async () => 'value');
    expect(executor.isCompleted('key-1')).toBe(true);
    executor.invalidate('key-1');
    expect(executor.isCompleted('key-1')).toBe(false);
  });

  it('cleans up expired records', async () => {
    const shortTtl = new IdempotentExecutor({ recordDir: dir, recordTtlMs: 10 });
    await shortTtl.execute('key-1', async () => 'value');
    // Wait for TTL
    await new Promise(resolve => setTimeout(resolve, 20));
    const cleaned = shortTtl.cleanup();
    expect(cleaned).toBe(1);
  });

  it('generates deterministic keys', () => {
    const key1 = IdempotentExecutor.generateKey({ runId: 'r1', taskDescription: 'task' });
    const key2 = IdempotentExecutor.generateKey({ runId: 'r1', taskDescription: 'task' });
    expect(key1).toBe(key2);
  });

  it('generates different keys for different inputs', () => {
    const key1 = IdempotentExecutor.generateKey({ runId: 'r1', taskDescription: 'task1' });
    const key2 = IdempotentExecutor.generateKey({ runId: 'r1', taskDescription: 'task2' });
    expect(key1).not.toBe(key2);
  });
});
