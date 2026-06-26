import { promises as fs } from 'fs';
import path from 'path';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ListOptions {
  filter?: {
    searchTerm?: string;
    createdAfter?: string;
    createdBefore?: string;
  };
  offset?: number;
  limit?: number;
}

export interface StorageAdapter {
  persist(id: string, data: Session): Promise<void>;
  load(id: string): Promise<Session | null>;
  listAll(): Promise<Session[]>;
}

export class SessionStore {
  private cache = new Map<string, Session>();
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async saveSession(session: Session): Promise<void> {
    this.cache.set(session.id, session);
    await this.adapter.persist(session.id, session);
  }

  async recoverSession(sessionId: string): Promise<Session | null> {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;

    const session = await this.adapter.load(sessionId);
    if (session) {
      this.cache.set(sessionId, session);
    }
    return session;
  }

  async listSessions(options: ListOptions = {}): Promise<SessionSummary[]> {
    const allSessions = await this.adapter.listAll();
    const { filter, offset = 0, limit = 100 } = options;

    let filtered = allSessions;
    if (filter) {
      filtered = allSessions.filter((session) => {
        if (filter.searchTerm && !session.title.toLowerCase().includes(filter.searchTerm.toLowerCase())) {
          return false;
        }
        if (filter.createdAfter && session.createdAt < filter.createdAfter) {
          return false;
        }
        if (filter.createdBefore && session.createdAt > filter.createdBefore) {
          return false;
        }
        return true;
      });
    }

    const sorted = filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const paginated = sorted.slice(offset, offset + limit);

    return paginated.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    }));
  }
}

export class FileStorageAdapter implements StorageAdapter {
  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.storePath, { recursive: true });
  }

  async persist(id: string, data: Session): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.storePath, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async load(id: string): Promise<Session | null> {
    const filePath = path.join(this.storePath, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as Session;
    } catch {
      return null;
    }
  }

  async listAll(): Promise<Session[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.storePath);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(this.storePath, file), 'utf-8');
        sessions.push(JSON.parse(data) as Session);
      } catch {
        // Skip corrupted files
      }
    }

    return sessions;
  }
}
