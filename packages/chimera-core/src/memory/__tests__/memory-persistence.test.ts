import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryPersistence } from '../memory-persistence.js';
import { existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

function tmpDir(): string {
  return path.join(os.tmpdir(), `chimera-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('MemoryPersistence', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('creates storage directory and file on first write', async () => {
    const persistence = new MemoryPersistence({ workspaceRoot: dir });
    expect(existsSync(path.dirname(persistence.getStoragePath()))).toBe(true);

    await persistence.getMemory().write({
      content: 'test fact',
      topic: 'test',
      importance: 0.8,
    });

    expect(existsSync(persistence.getStoragePath())).toBe(true);
    const raw = readFileSync(persistence.getStoragePath(), 'utf-8');
    expect(raw).toContain('test fact');
  });

  it('persists across instances', async () => {
    const p1 = new MemoryPersistence({ workspaceRoot: dir });
    await p1.getMemory().write({ content: 'persistent fact', topic: 'test', importance: 0.9 });

    const p2 = new MemoryPersistence({ workspaceRoot: dir });
    const results = await p2.getMemory().retrieve({ text: 'persistent fact', topK: 5 });
    expect(results.length).toBe(1);
    expect(results[0].item.content).toBe('persistent fact');
  });

  it('computes correct storage path', () => {
    const persistence = new MemoryPersistence({ workspaceRoot: dir });
    expect(persistence.getStoragePath()).toBe(path.join(dir, '.chimera', 'memory', 'long-term.json'));
  });

  it('respects custom memoryDir', () => {
    const persistence = new MemoryPersistence({ workspaceRoot: dir, memoryDir: 'custom/memory' });
    expect(persistence.getStoragePath()).toBe(path.join(dir, 'custom', 'memory', 'long-term.json'));
  });

  it('delegates forget to LongTermMemory', async () => {
    const persistence = new MemoryPersistence({ workspaceRoot: dir });
    const item = await persistence.getMemory().write({ content: 'forgettable', topic: 'test' });
    expect(persistence.forget(item.id)).toBe(true);
    expect(persistence.getMemory().size()).toBe(0);
  });

  it('delegates forgetByTopic to LongTermMemory', async () => {
    const persistence = new MemoryPersistence({ workspaceRoot: dir });
    await persistence.getMemory().write({ content: 'a', topic: 'topic-a' });
    await persistence.getMemory().write({ content: 'b', topic: 'topic-b' });
    await persistence.getMemory().write({ content: 'c', topic: 'topic-a' });

    const removed = persistence.forgetByTopic('topic-a');
    expect(removed).toBe(2);
    expect(persistence.getMemory().size()).toBe(1);
  });
});
