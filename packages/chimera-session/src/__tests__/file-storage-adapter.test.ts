import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileStorageAdapter, Session } from '../session-store.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-1',
    title: 'Test Session',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:05:00.000Z',
    ...overrides,
  };
}

describe('FileStorageAdapter', () => {
  let tmpDir: string;
  let adapter: FileStorageAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-fsa-test-'));
    adapter = new FileStorageAdapter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('persist and load', () => {
    it('writes a session file and reads it back', async () => {
      const session = makeSession();
      await adapter.persist(session.id, session);
      const loaded = await adapter.load(session.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.title).toBe(session.title);
      expect(loaded!.messages).toEqual(session.messages);
    });

    it('creates a valid JSON file on disk', async () => {
      const session = makeSession();
      await adapter.persist(session.id, session);

      const filePath = path.join(tmpDir, `${session.id}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(session.id);
    });

    it('returns null for non-existent session', async () => {
      const loaded = await adapter.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('handles nested directory creation', async () => {
      const deepPath = path.join(tmpDir, 'a', 'b', 'c');
      const deepAdapter = new FileStorageAdapter(deepPath);
      await deepAdapter.persist('deep', makeSession());

      const loaded = await deepAdapter.load('deep');
      expect(loaded).not.toBeNull();
    });
  });

  describe('listAll', () => {
    it('returns all sessions in directory', async () => {
      await adapter.persist('s1', makeSession({ id: 's1', title: 'First' }));
      await adapter.persist('s2', makeSession({ id: 's2', title: 'Second' }));

      const sessions = await adapter.listAll();
      expect(sessions).toHaveLength(2);
    });

    it('returns empty array for empty directory', async () => {
      const sessions = await adapter.listAll();
      expect(sessions).toEqual([]);
    });

    it('skips non-json files', async () => {
      await fs.writeFile(path.join(tmpDir, 'readme.txt'), 'hello');
      await fs.writeFile(path.join(tmpDir, '.gitignore'), '*');
      await adapter.persist('valid', makeSession());

      const sessions = await adapter.listAll();
      expect(sessions).toHaveLength(1);
    });

    it('skips corrupted json files', async () => {
      await fs.writeFile(path.join(tmpDir, 'bad.json'), '{not valid json!!!');
      await adapter.persist('good', makeSession());

      const sessions = await adapter.listAll();
      expect(sessions).toHaveLength(1);
    });

    it('creates directory if it does not exist on listAll', async () => {
      const nonExistent = path.join(tmpDir, 'new-dir');
      const freshAdapter = new FileStorageAdapter(nonExistent);
      const sessions = await freshAdapter.listAll();
      expect(sessions).toEqual([]);

      const dirExists = await fs.stat(nonExistent);
      expect(dirExists.isDirectory()).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('roundtrips complex nested data', async () => {
      const session = makeSession({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: 'The answer is 4' },
          { role: 'tool', content: '{"result": 4}' },
        ],
      });

      await adapter.persist(session.id, session);
      const loaded = await adapter.load(session.id);
      expect(loaded!.messages).toHaveLength(4);
      expect(loaded!.messages[3].role).toBe('tool');
    });

    it('preserves special characters', async () => {
      const session = makeSession({
        title: 'Test with "quotes" and \\ backslash & <html>',
      });

      await adapter.persist(session.id, session);
      const loaded = await adapter.load(session.id);
      expect(loaded!.title).toBe('Test with "quotes" and \\ backslash & <html>');
    });

    it('preserves unicode', async () => {
      const session = makeSession({
        title: '日本語テスト 🚀 émojis',
      });

      await adapter.persist(session.id, session);
      const loaded = await adapter.load(session.id);
      expect(loaded!.title).toBe('日本語テスト 🚀 émojis');
    });
  });

  describe('error handling', () => {
    it('returns null when reading corrupted file', async () => {
      // Write a file that passes the .json extension check but is invalid JSON
      await fs.writeFile(path.join(tmpDir, 'corrupt.json'), 'null byte \x00 here');
      const loaded = await adapter.load('corrupt');
      // Should not throw, just return null
      expect(loaded).toBeNull();
    });

    it('listAll skips a file that fails to parse', async () => {
      await fs.writeFile(path.join(tmpDir, 'broken.json'), 'truly broken{{{');
      await adapter.persist('fine', makeSession());

      const sessions = await adapter.listAll();
      expect(sessions).toHaveLength(1);
      // The corrupt 'broken.json' should be silently skipped. The remaining
      // session id comes from makeSession() (test-session-1), not the storage
      // id 'fine'.
      expect(sessions[0].id).toBe('test-session-1');
    });
  });

  describe('ensureDir', () => {
    it('creates directory recursively', async () => {
      const nested = path.join(tmpDir, 'x', 'y', 'z');
      const a = new FileStorageAdapter(nested);
      await a.ensureDir();

      const stat = await fs.stat(nested);
      expect(stat.isDirectory()).toBe(true);
    });

    it('does not throw if directory already exists', async () => {
      await adapter.ensureDir();
      await adapter.ensureDir(); // Second call should not throw
    });
  });
});
