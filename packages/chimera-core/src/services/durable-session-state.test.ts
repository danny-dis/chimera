import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableSessionState } from './durable-session-state.js';

describe('DurableSessionState', () => {
  let dir: string;
  let state: DurableSessionState;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'durable-state-'));
    state = new DurableSessionState({ snapshotDir: dir });
  });

  afterEach(() => {
    state.stopAutoSave();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and loads a snapshot', () => {
    state.saveSnapshot({
      id: 'session-1',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: 'run-1',
      runs: [],
      savedAt: Date.now(),
    });
    const loaded = state.loadSnapshot('session-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('session-1');
    expect(loaded?.status).toBe('active');
  });

  it('returns null for non-existent session', () => {
    expect(state.loadSnapshot('nonexistent')).toBeNull();
  });

  it('loads the latest snapshot', () => {
    state.saveSnapshot({
      id: 'session-1',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now(),
    });
    state.saveSnapshot({
      id: 'session-2',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now() + 1000,
    });
    const latest = state.loadLatestSnapshot();
    expect(latest?.id).toBe('session-2');
  });

  it('lists all snapshots', () => {
    state.saveSnapshot({
      id: 'session-1',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now(),
    });
    state.saveSnapshot({
      id: 'session-2',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now(),
    });
    expect(state.listSnapshots()).toHaveLength(2);
  });

  it('deletes a snapshot', () => {
    state.saveSnapshot({
      id: 'session-1',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now(),
    });
    expect(state.deleteSnapshot('session-1')).toBe(true);
    expect(state.loadSnapshot('session-1')).toBeNull();
  });

  it('persists snapshots to disk', () => {
    state.saveSnapshot({
      id: 'session-1',
      status: 'active',
      createdAt: 1000,
      updatedAt: 2000,
      activeRunId: null,
      runs: [],
      savedAt: Date.now(),
    });
    const { readFileSync } = require('node:fs');
    const files = require('node:fs').readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^session-.*\.json$/);
    const content = readFileSync(join(dir, files[0]), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.id).toBe('session-1');
  });
});
