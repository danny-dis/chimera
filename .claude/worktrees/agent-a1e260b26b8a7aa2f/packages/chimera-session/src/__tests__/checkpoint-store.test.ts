import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { CheckpointStore, SessionCheckpoint } from '../index.js';
import type { Mode } from '@chimera/core';

function makeCheckpoint(overrides: Partial<SessionCheckpoint> = {}): SessionCheckpoint {
  return {
    sessionId: 'test-session-1',
    timestamp: '2025-01-15T10:00:00.000Z',
    task: 'Build a login form',
    mode: 'code' as Mode,
    messages: [
      { role: 'user', content: 'Create a login form' },
      { role: 'assistant', content: 'Here is the form...' },
    ],
    events: [],
    costSpend: { 'claude-3.5-sonnet': 0.12, 'gpt-4o': 0.05 },
    metadata: {
      agentCount: 2,
      turnCount: 4,
      status: 'active',
    },
    ...overrides,
  };
}

describe('CheckpointStore', () => {
  let tmpDir: string;
  let store: CheckpointStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-test-'));
    store = new CheckpointStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('save and load', () => {
    it('saves a checkpoint and loads it back', async () => {
      const cp = makeCheckpoint();
      await store.save(cp);
      const loaded = await store.load(cp.sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe(cp.sessionId);
      expect(loaded!.task).toBe(cp.task);
      expect(loaded!.messages).toEqual(cp.messages);
      expect(loaded!.costSpend).toEqual(cp.costSpend);
    });

    it('returns null for non-existent session', async () => {
      const loaded = await store.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('save returns the file path', async () => {
      const cp = makeCheckpoint({ sessionId: 'path-test' });
      const filePath = await store.save(cp);
      expect(filePath).toBe(path.join(tmpDir, 'path-test.json'));
    });

    it('overwrites existing checkpoint on re-save', async () => {
      const cp = makeCheckpoint();
      await store.save(cp);
      cp.task = 'Updated task';
      cp.metadata.status = 'completed';
      await store.save(cp);

      const loaded = await store.load(cp.sessionId);
      expect(loaded!.task).toBe('Updated task');
      expect(loaded!.metadata.status).toBe('completed');
    });
  });

  describe('list', () => {
    it('lists all checkpoints as summaries', async () => {
      await store.save(makeCheckpoint({ sessionId: 'a', timestamp: '2025-01-15T10:00:00.000Z' }));
      await store.save(makeCheckpoint({ sessionId: 'b', timestamp: '2025-01-15T11:00:00.000Z' }));

      const summaries = await store.list();
      expect(summaries).toHaveLength(2);
    });

    it('returns summaries sorted by timestamp descending', async () => {
      await store.save(makeCheckpoint({ sessionId: 'old', timestamp: '2025-01-10T10:00:00.000Z' }));
      await store.save(makeCheckpoint({ sessionId: 'new', timestamp: '2025-01-20T10:00:00.000Z' }));

      const summaries = await store.list();
      expect(summaries[0].id).toBe('new');
      expect(summaries[1].id).toBe('old');
    });

    it('computes total cost from costSpend', async () => {
      await store.save(makeCheckpoint({
        sessionId: 'cost-test',
        costSpend: { provider1: 0.1, provider2: 0.3 },
      }));

      const summaries = await store.list();
      expect(summaries[0].cost).toBe(0.4);
    });

    it('skips non-json files in directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'readme.txt'), 'hello');
      await store.save(makeCheckpoint({ sessionId: 'valid' }));

      const summaries = await store.list();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('valid');
    });

    it('skips corrupted json files', async () => {
      await fs.writeFile(path.join(tmpDir, 'bad.json'), '{corrupt');
      await store.save(makeCheckpoint({ sessionId: 'good' }));

      const summaries = await store.list();
      expect(summaries).toHaveLength(1);
    });

    it('creates directory if it does not exist', async () => {
      const deep = path.join(tmpDir, 'nested', 'deep');
      const deepStore = new CheckpointStore(deep);
      await deepStore.save(makeCheckpoint());

      const summaries = await deepStore.list();
      expect(summaries).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('deletes an existing checkpoint', async () => {
      const cp = makeCheckpoint();
      await store.save(cp);
      const result = await store.delete(cp.sessionId);
      expect(result).toBe(true);

      const loaded = await store.load(cp.sessionId);
      expect(loaded).toBeNull();
    });

    it('returns false for non-existent session', async () => {
      const result = await store.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('updateStatus', () => {
    it('updates the metadata status', async () => {
      const cp = makeCheckpoint();
      await store.save(cp);

      await store.updateStatus(cp.sessionId, 'completed');
      const loaded = await store.load(cp.sessionId);
      expect(loaded!.metadata.status).toBe('completed');
    });

    it('does nothing for non-existent session', async () => {
      // Should not throw
      await store.updateStatus('nonexistent', 'failed');
    });

    it('preserves other checkpoint fields on status update', async () => {
      const cp = makeCheckpoint();
      await store.save(cp);

      await store.updateStatus(cp.sessionId, 'failed');
      const loaded = await store.load(cp.sessionId);
      expect(loaded!.task).toBe(cp.task);
      expect(loaded!.messages).toEqual(cp.messages);
      expect(loaded!.costSpend).toEqual(cp.costSpend);
    });
  });

  describe('generateSessionId', () => {
    it('generates a string id', () => {
      const id = store.generateSessionId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('generates unique ids', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(store.generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('id format is timestamp-random', () => {
      const id = store.generateSessionId();
      const parts = id.split('-');
      expect(parts.length).toBe(2);
      // First part is base36 timestamp, second is hex
      expect(parseInt(parts[0], 36)).toBeGreaterThan(0);
      expect(/^[0-9a-f]+$/.test(parts[1])).toBe(true);
    });
  });
});
