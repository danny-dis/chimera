import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStore, StorageAdapter, Session, ListOptions } from '../session-store.js';

class InMemoryAdapter implements StorageAdapter {
  private data = new Map<string, Session>();

  async persist(id: string, data: Session): Promise<void> {
    this.data.set(id, data);
  }

  async load(id: string): Promise<Session | null> {
    return this.data.get(id) ?? null;
  }

  async listAll(): Promise<Session[]> {
    return Array.from(this.data.values());
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-1',
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

describe('SessionStore', () => {
  let adapter: InMemoryAdapter;
  let store: SessionStore;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    store = new SessionStore(adapter);
  });

  describe('saveSession', () => {
    it('persists session via adapter', async () => {
      const session = makeSession();
      await store.saveSession(session);

      const loaded = await adapter.load(session.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
    });

    it('populates cache on save', async () => {
      const session = makeSession();
      await store.saveSession(session);

      const recovered = await store.recoverSession(session.id);
      expect(recovered).not.toBeNull();
      expect(recovered!.id).toBe(session.id);
    });
  });

  describe('recoverSession', () => {
    it('returns null for non-existent session', async () => {
      const result = await store.recoverSession('nonexistent');
      expect(result).toBeNull();
    });

    it('loads from adapter and caches', async () => {
      const session = makeSession();
      await adapter.persist(session.id, session);

      const result = await store.recoverSession(session.id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe(session.title);
    });

    it('serves from cache on second access', async () => {
      const session = makeSession();
      await store.saveSession(session);

      // Modify adapter directly - store should still return cached version
      await adapter.persist(session.id, makeSession({ id: session.id, title: 'Modified' }));

      const result = await store.recoverSession(session.id);
      expect(result!.title).toBe('Test Session');
    });
  });

  describe('listSessions', () => {
    it('returns empty array when no sessions', async () => {
      const sessions = await store.listSessions();
      expect(sessions).toEqual([]);
    });

    it('returns session summaries with messageCount', async () => {
      await store.saveSession(makeSession({
        id: 's1',
        messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
      }));
      await store.saveSession(makeSession({
        id: 's2',
        messages: [{ role: 'user', content: 'a' }],
      }));

      const summaries = await store.listSessions();
      expect(summaries).toHaveLength(2);
      expect(summaries.find(s => s.id === 's1')!.messageCount).toBe(2);
      expect(summaries.find(s => s.id === 's2')!.messageCount).toBe(1);
    });

    it('sorts by updatedAt descending', async () => {
      await store.saveSession(makeSession({
        id: 'old',
        updatedAt: '2025-01-10T10:00:00.000Z',
      }));
      await store.saveSession(makeSession({
        id: 'new',
        updatedAt: '2025-01-20T10:00:00.000Z',
      }));

      const summaries = await store.listSessions();
      expect(summaries[0].id).toBe('new');
      expect(summaries[1].id).toBe('old');
    });
  });

  describe('filtering', () => {
    beforeEach(async () => {
      await store.saveSession(makeSession({
        id: 's1', title: 'Build Login Page',
        createdAt: '2025-01-10T10:00:00.000Z', updatedAt: '2025-01-10T10:00:00.000Z',
      }));
      await store.saveSession(makeSession({
        id: 's2', title: 'Fix Dashboard Bug',
        createdAt: '2025-01-15T10:00:00.000Z', updatedAt: '2025-01-15T10:00:00.000Z',
      }));
      await store.saveSession(makeSession({
        id: 's3', title: 'Build API Endpoints',
        createdAt: '2025-01-20T10:00:00.000Z', updatedAt: '2025-01-20T10:00:00.000Z',
      }));
    });

    it('filters by search term (case-insensitive)', async () => {
      const results = await store.listSessions({ filter: { searchTerm: 'build' } });
      expect(results).toHaveLength(2);
      expect(results.every(s => s.title.toLowerCase().includes('build'))).toBe(true);
    });

    it('filters by createdAfter', async () => {
      const results = await store.listSessions({
        filter: { createdAfter: '2025-01-12T00:00:00.000Z' },
      });
      expect(results).toHaveLength(2);
      expect(results.every(s => s.createdAt > '2025-01-12T00:00:00.000Z')).toBe(true);
    });

    it('filters by createdBefore', async () => {
      const results = await store.listSessions({
        filter: { createdBefore: '2025-01-18T00:00:00.000Z' },
      });
      expect(results).toHaveLength(2);
    });

    it('combines multiple filters', async () => {
      const results = await store.listSessions({
        filter: {
          searchTerm: 'build',
          createdAfter: '2025-01-12T00:00:00.000Z',
        },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('s3');
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await store.saveSession(makeSession({
          id: `s${i}`,
          title: `Session ${i}`,
          updatedAt: `2025-01-${10 + i}T10:00:00.000Z`,
        }));
      }
    });

    it('returns default page of 100', async () => {
      const results = await store.listSessions();
      expect(results).toHaveLength(5);
    });

    it('limits results', async () => {
      const results = await store.listSessions({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('supports offset', async () => {
      const results = await store.listSessions({ offset: 2, limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('returns empty array when offset exceeds total', async () => {
      const results = await store.listSessions({ offset: 10 });
      expect(results).toEqual([]);
    });
  });

  describe('adapter pattern', () => {
    it('works with custom adapter', async () => {
      class NoopAdapter implements StorageAdapter {
        async persist(): Promise<void> {}
        async load(): Promise<Session | null> { return null; }
        async listAll(): Promise<Session[]> { return []; }
      }

      const store2 = new SessionStore(new NoopAdapter());
      const session = makeSession();
      await store2.saveSession(session);
      // In-memory cache is authoritative for saved sessions, even if the
      // adapter is a no-op. The cache is what recoverSession checks first.
      const result = await store2.recoverSession(session.id);
      expect(result).toEqual(session);
    });

    it('falls back to adapter when session is not in cache', async () => {
      class NoopAdapter implements StorageAdapter {
        async persist(): Promise<void> {}
        async load(): Promise<Session | null> { return null; }
        async listAll(): Promise<Session[]> { return []; }
      }

      const store2 = new SessionStore(new NoopAdapter());
      // No saveSession call, so cache is empty, and adapter returns null.
      const result = await store2.recoverSession('test-1');
      expect(result).toBeNull();
    });
  });
});
