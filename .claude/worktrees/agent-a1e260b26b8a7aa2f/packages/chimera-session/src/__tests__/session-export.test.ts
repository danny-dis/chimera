import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SessionExporter, SessionImporter, ExportOptions, SessionExportBundle } from '../session-export.js';
import type { Session } from '../session-store.js';
import type { SessionCheckpoint } from '../index.js';
import type { Mode } from '@chimera/core';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    title: 'Test Session',
    messages: [{ role: 'user', content: 'Hello' }],
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:05:00.000Z',
    ...overrides,
  };
}

function makeCheckpoint(overrides: Partial<SessionCheckpoint> = {}): SessionCheckpoint {
  return {
    sessionId: 'session-1',
    timestamp: '2025-01-15T10:00:00.000Z',
    task: 'Build feature',
    mode: 'code' as Mode,
    messages: [],
    events: [],
    costSpend: { openai: 0.1 },
    metadata: { agentCount: 1, turnCount: 2, status: 'active' },
    ...overrides,
  };
}

describe('SessionExporter', () => {
  let exporter: SessionExporter;

  beforeEach(() => {
    exporter = new SessionExporter();
  });

  describe('exportBundle', () => {
    it('exports sessions and checkpoints with metadata', () => {
      const sessions = [makeSession()];
      const checkpoints = [makeCheckpoint()];

      const bundle = exporter.exportBundle(sessions, checkpoints);

      expect(bundle.metadata.version).toBe(1);
      expect(bundle.metadata.sessionCount).toBe(1);
      expect(bundle.metadata.checkpointCount).toBe(1);
      expect(bundle.sessions).toHaveLength(1);
      expect(bundle.checkpoints).toHaveLength(1);
    });

    it('sets exportedAt timestamp', () => {
      const bundle = exporter.exportBundle([], []);
      expect(bundle.metadata.exportedAt).toBeDefined();
      const date = new Date(bundle.metadata.exportedAt);
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('returns empty arrays when no data', () => {
      const bundle = exporter.exportBundle([], []);
      expect(bundle.sessions).toEqual([]);
      expect(bundle.checkpoints).toEqual([]);
      expect(bundle.metadata.sessionCount).toBe(0);
    });
  });

  describe('selective export', () => {
    const sessions = [
      makeSession({ id: 's1', createdAt: '2025-01-10T10:00:00.000Z' }),
      makeSession({ id: 's2', createdAt: '2025-01-15T10:00:00.000Z' }),
      makeSession({ id: 's3', createdAt: '2025-01-20T10:00:00.000Z' }),
    ];
    const checkpoints = [
      makeCheckpoint({ sessionId: 's1', timestamp: '2025-01-10T10:00:00.000Z' }),
      makeCheckpoint({ sessionId: 's2', timestamp: '2025-01-15T10:00:00.000Z' }),
      makeCheckpoint({ sessionId: 's3', timestamp: '2025-01-20T10:00:00.000Z' }),
    ];

    it('filters by sessionIds', () => {
      const bundle = exporter.exportBundle(sessions, checkpoints, { sessionIds: ['s1', 's3'] });
      expect(bundle.sessions).toHaveLength(2);
      expect(bundle.sessions.map(s => s.id)).toEqual(['s1', 's3']);
    });

    it('filters by checkpointIds', () => {
      const bundle = exporter.exportBundle(sessions, checkpoints, { checkpointIds: ['s2'] });
      expect(bundle.checkpoints).toHaveLength(1);
      expect(bundle.checkpoints[0].sessionId).toBe('s2');
    });

    it('filters by createdAfter', () => {
      const bundle = exporter.exportBundle(sessions, checkpoints, {
        createdAfter: '2025-01-12T00:00:00.000Z',
      });
      expect(bundle.sessions).toHaveLength(2);
      expect(bundle.checkpoints).toHaveLength(2);
    });

    it('filters by createdBefore', () => {
      const bundle = exporter.exportBundle(sessions, checkpoints, {
        createdBefore: '2025-01-18T00:00:00.000Z',
      });
      expect(bundle.sessions).toHaveLength(2);
      expect(bundle.checkpoints).toHaveLength(2);
    });

    it('combines date range filters', () => {
      const bundle = exporter.exportBundle(sessions, checkpoints, {
        createdAfter: '2025-01-12T00:00:00.000Z',
        createdBefore: '2025-01-18T00:00:00.000Z',
      });
      expect(bundle.sessions).toHaveLength(1);
      expect(bundle.sessions[0].id).toBe('s2');
    });
  });

  describe('exportToFile', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-export-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('writes a valid JSON file', async () => {
      const filePath = path.join(tmpDir, 'export.json');
      await exporter.exportToFile(filePath, [makeSession()], [makeCheckpoint()]);

      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.sessions).toHaveLength(1);
    });

    it('writes indented JSON', async () => {
      const filePath = path.join(tmpDir, 'export.json');
      await exporter.exportToFile(filePath, [], []);

      const raw = await fs.readFile(filePath, 'utf-8');
      // Check it's formatted (contains newlines from pretty-print)
      expect(raw).toContain('\n');
    });
  });
});

describe('SessionImporter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-import-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('validates a correct bundle', () => {
      const importer = new SessionImporter();
      const bundle: SessionExportBundle = {
        metadata: { exportedAt: '2025-01-15T10:00:00.000Z', version: 1, sessionCount: 0, checkpointCount: 0 },
        sessions: [],
        checkpoints: [],
      };
      const result = importer.validate(bundle);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects non-object input', () => {
      const importer = new SessionImporter();
      const result = importer.validate('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects missing metadata', () => {
      const importer = new SessionImporter();
      const result = importer.validate({ sessions: [], checkpoints: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects missing sessions array', () => {
      const importer = new SessionImporter();
      const result = importer.validate({
        metadata: { version: 1, exportedAt: '', sessionCount: 0, checkpointCount: 0 },
        checkpoints: [],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects version 0', () => {
      const importer = new SessionImporter();
      const result = importer.validate({
        metadata: { version: 0, exportedAt: '', sessionCount: 0, checkpointCount: 0 },
        sessions: [],
        checkpoints: [],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('importFromFile', () => {
    it('imports a valid export file', async () => {
      const filePath = path.join(tmpDir, 'valid-export.json');
      const bundle: SessionExportBundle = {
        metadata: { exportedAt: '2025-01-15T10:00:00.000Z', version: 1, sessionCount: 1, checkpointCount: 0 },
        sessions: [makeSession()],
        checkpoints: [],
      };
      await fs.writeFile(filePath, JSON.stringify(bundle), 'utf-8');

      const importer = new SessionImporter();
      const result = await importer.importFromFile(filePath);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('session-1');
    });

    it('throws on invalid JSON file', async () => {
      const filePath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filePath, '{not json', 'utf-8');

      const importer = new SessionImporter();
      await expect(importer.importFromFile(filePath)).rejects.toThrow();
    });

    it('throws on invalid bundle structure', async () => {
      const filePath = path.join(tmpDir, 'invalid.json');
      await fs.writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      const importer = new SessionImporter();
      await expect(importer.importFromFile(filePath)).rejects.toThrow('Invalid import file');
    });

    it('throws on non-existent file', async () => {
      const importer = new SessionImporter();
      await expect(importer.importFromFile(path.join(tmpDir, 'nope.json'))).rejects.toThrow();
    });
  });

  describe('importFromJson', () => {
    it('imports from a JSON string', () => {
      const bundle: SessionExportBundle = {
        metadata: { exportedAt: '2025-01-15T10:00:00.000Z', version: 1, sessionCount: 1, checkpointCount: 0 },
        sessions: [makeSession()],
        checkpoints: [],
      };
      const importer = new SessionImporter();
      const result = importer.importFromJson(JSON.stringify(bundle));
      expect(result.sessions).toHaveLength(1);
    });

    it('throws on invalid JSON string', () => {
      const importer = new SessionImporter();
      expect(() => importer.importFromJson('not json')).toThrow();
    });

    it('throws on structurally invalid data', () => {
      const importer = new SessionImporter();
      expect(() => importer.importFromJson(JSON.stringify({ x: 1 }))).toThrow('Invalid import data');
    });
  });

  describe('mergeWithExisting', () => {
    it('imports new sessions and checkpoints', () => {
      const importer = new SessionImporter();
      const imported: SessionExportBundle = {
        metadata: { exportedAt: '', version: 1, sessionCount: 2, checkpointCount: 1 },
        sessions: [makeSession({ id: 'new-1' }), makeSession({ id: 'new-2' })],
        checkpoints: [makeCheckpoint({ sessionId: 'new-1' })],
      };

      const existingSessions: Session[] = [];
      const existingCheckpoints: SessionCheckpoint[] = [];

      const result = importer.mergeWithExisting(imported, existingSessions, existingCheckpoints);
      expect(result.sessionsImported).toBe(2);
      expect(result.checkpointsImported).toBe(1);
      expect(existingSessions).toHaveLength(2);
      expect(existingCheckpoints).toHaveLength(1);
    });

    it('skips duplicates and reports errors', () => {
      const importer = new SessionImporter();
      const imported: SessionExportBundle = {
        metadata: { exportedAt: '', version: 1, sessionCount: 1, checkpointCount: 0 },
        sessions: [makeSession({ id: 'existing-1' })],
        checkpoints: [],
      };

      const existingSessions: Session[] = [makeSession({ id: 'existing-1' })];
      const existingCheckpoints: SessionCheckpoint[] = [];

      const result = importer.mergeWithExisting(imported, existingSessions, existingCheckpoints);
      expect(result.sessionsImported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('already exists');
    });

    it('handles empty import', () => {
      const importer = new SessionImporter();
      const imported: SessionExportBundle = {
        metadata: { exportedAt: '', version: 1, sessionCount: 0, checkpointCount: 0 },
        sessions: [],
        checkpoints: [],
      };

      const result = importer.mergeWithExisting(imported, [], []);
      expect(result.sessionsImported).toBe(0);
      expect(result.checkpointsImported).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('custom validation rules', () => {
    it('accepts custom rules', () => {
      const customRules = [
        {
          validate: (data: unknown): boolean => {
            const obj = data as Record<string, unknown>;
            return typeof obj === 'object' && obj !== null && 'custom' in obj;
          },
          message: 'Must have custom field',
        },
      ];
      const importer = new SessionImporter(customRules);
      const result = importer.validate({ custom: true });
      expect(result.valid).toBe(true);
    });

    it('rejects when custom rules fail', () => {
      const customRules = [
        {
          validate: () => false,
          message: 'Always fails',
        },
      ];
      const importer = new SessionImporter(customRules);
      const result = importer.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Always fails');
    });
  });
});
