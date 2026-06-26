import { describe, it, expect } from 'vitest';
import { SessionMigrator, createDefaultMigrator } from '../session-migrator.js';
import type { Session } from '../session-store.js';
import type { SessionCheckpoint } from '../index.js';
import type { Mode } from '@chimera/core';

function makeLegacySession(): Session {
  return {
    id: 'test-1',
    title: 'Legacy Session',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ],
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:05:00.000Z',
  };
}

function makeLegacyCheckpoint(): SessionCheckpoint {
  return {
    sessionId: 'cp-1',
    timestamp: '2025-01-15T10:00:00.000Z',
    task: 'Build something',
    mode: 'code' as Mode,
    messages: [],
    events: [],
    costSpend: { openai: 0.1 },
    metadata: { agentCount: 1, turnCount: 2, status: 'active' },
  };
}

describe('SessionMigrator', () => {
  describe('register', () => {
    it('registers migration steps', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'Step 1', migrate: d => d });
      m.register({ version: 2, description: 'Step 2', migrate: d => d });

      expect(m.getSteps()).toHaveLength(2);
    });

    it('sorts steps by version', () => {
      const m = new SessionMigrator();
      m.register({ version: 3, description: 'Step 3', migrate: d => d });
      m.register({ version: 1, description: 'Step 1', migrate: d => d });
      m.register({ version: 2, description: 'Step 2', migrate: d => d });

      const versions = m.getSteps().map(s => s.version);
      expect(versions).toEqual([1, 2, 3]);
    });

    it('throws on duplicate version', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'First', migrate: d => d });

      expect(() => m.register({ version: 1, description: 'Duplicate', migrate: d => d }))
        .toThrow('Migration step for version 1 already registered');
    });
  });

  describe('getLatestVersion', () => {
    it('returns 0 when no steps registered', () => {
      const m = new SessionMigrator();
      expect(m.getLatestVersion()).toBe(0);
    });

    it('returns highest registered version', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'a', migrate: d => d });
      m.register({ version: 5, description: 'b', migrate: d => d });
      expect(m.getLatestVersion()).toBe(5);
    });
  });

  describe('getVersion', () => {
    it('returns 0 for null/undefined', () => {
      const m = new SessionMigrator();
      expect(m.getVersion(null)).toBe(0);
      expect(m.getVersion(undefined)).toBe(0);
    });

    it('returns 0 for objects without _schemaVersion', () => {
      const m = new SessionMigrator();
      expect(m.getVersion({ foo: 'bar' })).toBe(0);
    });

    it('returns version from _schemaVersion field', () => {
      const m = new SessionMigrator();
      expect(m.getVersion({ _schemaVersion: 3 })).toBe(3);
    });
  });

  describe('migrate', () => {
    it('applies steps in order up to target version', () => {
      const m = new SessionMigrator();
      const log: string[] = [];
      m.register({ version: 1, description: 'step1', migrate: d => { log.push('v1'); return d; } });
      m.register({ version: 2, description: 'step2', migrate: d => { log.push('v2'); return d; } });
      m.register({ version: 3, description: 'step3', migrate: d => { log.push('v3'); return d; } });

      m.migrate({ _schemaVersion: 0 }, 2);
      expect(log).toEqual(['v1', 'v2']);
    });

    it('skips steps already applied', () => {
      const m = new SessionMigrator();
      const log: string[] = [];
      m.register({ version: 1, description: 'step1', migrate: d => { log.push('v1'); return d; } });
      m.register({ version: 2, description: 'step2', migrate: d => { log.push('v2'); return d; } });

      m.migrate({ _schemaVersion: 1 });
      expect(log).toEqual(['v2']);
    });

    it('applies all steps when no target specified', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'step1', migrate: d => ({ ...d, _schemaVersion: 1 }) });
      m.register({ version: 2, description: 'step2', migrate: d => ({ ...d, _schemaVersion: 2 }) });

      const result = m.migrate({ oldField: true });
      expect(result.toVersion).toBe(2);
      expect(result.stepsApplied).toHaveLength(2);
    });

    it('returns stepsApplied in result', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'Add version field', migrate: d => d });
      m.register({ version: 2, description: 'Transform data', migrate: d => d });

      const result = m.migrate({}, 2);
      expect(result.stepsApplied).toEqual(['Add version field', 'Transform data']);
    });

    it('returns empty stepsApplied when already at target', () => {
      const m = new SessionMigrator();
      m.register({ version: 1, description: 'step1', migrate: d => d });

      const result = m.migrate({ _schemaVersion: 1 });
      expect(result.stepsApplied).toEqual([]);
      expect(result.data).toEqual({ _schemaVersion: 1 });
    });

    it('returns original data unchanged when no steps registered', () => {
      const m = new SessionMigrator();
      const data = { foo: 'bar' };
      const result = m.migrate(data);
      expect(result.data).toBe(data);
    });
  });

  describe('migrateSession', () => {
    it('migrates a session', () => {
      const m = createDefaultMigrator();
      const session = makeLegacySession();
      const result = m.migrateSession(session);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(2);
      expect(result.stepsApplied.length).toBeGreaterThan(0);
    });
  });

  describe('migrateCheckpoint', () => {
    it('migrates a checkpoint', () => {
      const m = createDefaultMigrator();
      const cp = makeLegacyCheckpoint();
      const result = m.migrateCheckpoint(cp);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(2);
    });
  });

  describe('isUpToDate', () => {
    it('returns true when data is at latest version', () => {
      const m = new SessionMigrator();
      m.register({ version: 2, description: 'step', migrate: d => d });

      expect(m.isUpToDate({ _schemaVersion: 2 })).toBe(true);
      expect(m.isUpToDate({ _schemaVersion: 3 })).toBe(true);
    });

    it('returns false when data is behind', () => {
      const m = new SessionMigrator();
      m.register({ version: 2, description: 'step', migrate: d => d });

      expect(m.isUpToDate({ _schemaVersion: 1 })).toBe(false);
      expect(m.isUpToDate({})).toBe(false);
    });
  });
});

describe('createDefaultMigrator', () => {
  it('returns a migrator with 2 default steps', () => {
    const m = createDefaultMigrator();
    expect(m.getSteps()).toHaveLength(2);
    expect(m.getLatestVersion()).toBe(2);
  });

  it('v1 adds _schemaVersion field', () => {
    const m = createDefaultMigrator();
    const result = m.migrate({ foo: 'bar' }, 1);
    expect((result.data as Record<string, unknown>)._schemaVersion).toBe(1);
    expect((result.data as Record<string, unknown>).foo).toBe('bar');
  });

  it('v2 renames messages to history', () => {
    const m = createDefaultMigrator();
    const session = makeLegacySession();
    const result = m.migrate(session, 2);
    const data = result.data as Record<string, unknown>;
    expect(data.history).toBeDefined();
    expect((data.history as unknown[])).toEqual(session.messages);
    expect(data.messages).toBeUndefined();
    expect(data._schemaVersion).toBe(2);
  });

  it('full migration from v0 to v2', () => {
    const m = createDefaultMigrator();
    const session = makeLegacySession();
    const result = m.migrateSession(session);

    const data = result.data as Record<string, unknown>;
    expect(data._schemaVersion).toBe(2);
    expect(data.history).toBeDefined();
  });
});
