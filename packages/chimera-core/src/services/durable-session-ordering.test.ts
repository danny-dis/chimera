import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableSessionState, type SessionSnapshot } from './durable-session-state.js';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const fixture = (id: string): SessionSnapshot => ({
  id, status: 'active', createdAt: 1000, updatedAt: 2000, activeRunId: null, runs: [], savedAt: 0,
});

it('retains write order when snapshots are saved in the same millisecond', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chimera-snapshot-order-'));
  directories.push(directory);
  vi.spyOn(Date, 'now').mockReturnValue(5000);
  const state = new DurableSessionState({ snapshotDir: directory });
  state.saveSnapshot(fixture('first'));
  state.saveSnapshot(fixture('second'));
  expect(state.loadLatestSnapshot()?.id).toBe('second');
  expect(state.loadSnapshot('second')!.savedAt).toBeGreaterThan(state.loadSnapshot('first')!.savedAt);
});

it('retains ordering across restart even when the wall clock moves backwards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chimera-snapshot-restart-'));
  directories.push(directory);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(5000);
  new DurableSessionState({ snapshotDir: directory }).saveSnapshot(fixture('first'));
  clock.mockReturnValue(4000);
  const restarted = new DurableSessionState({ snapshotDir: directory });
  restarted.saveSnapshot(fixture('second'));
  expect(new DurableSessionState({ snapshotDir: directory }).loadLatestSnapshot()?.id).toBe('second');
});
