import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { ChimeraEvent, Mode } from '@chimera/core';

export type { Session, SessionSummary, ListOptions, StorageAdapter } from './session-store.js';
export { SessionStore as ConversationSessionStore, FileStorageAdapter } from './session-store.js';
export type { Message } from './session-store.js';
import type { Message } from './session-store.js';

// Session sync protocol — multi-device synchronization
export {
  SessionSynchronizer,
  FileSyncAdapter,
  createSessionSynchronizer,
} from './sync-protocol.js';
export type {
  SyncEvent,
  SyncEventType,
  SessionSyncState,
  SyncAdapter,
} from './sync-protocol.js';

export interface SessionCheckpoint {
  sessionId: string;
  timestamp: string;
  task: string;
  mode: Mode;
  messages: Message[];
  events: ChimeraEvent[];
  costSpend: Record<string, number>;
  metadata: {
    agentCount: number;
    turnCount: number;
    status: 'active' | 'completed' | 'failed';
  };
}

export interface CheckpointSummary {
  id: string;
  timestamp: string;
  task: string;
  mode: Mode;
  status: 'active' | 'completed' | 'failed';
  cost: number;
  turnCount: number;
}

export class CheckpointStore {
  private storePath: string;

  constructor(storePath?: string) {
    this.storePath = storePath ?? path.join(process.cwd(), '.chimera', 'sessions');
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.storePath, { recursive: true });
  }

  generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `${timestamp}-${random}`;
  }

  async save(checkpoint: SessionCheckpoint): Promise<string> {
    await this.ensureDir();
    const filePath = path.join(this.storePath, `${checkpoint.sessionId}.json`);
    const tmpPath = `${filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmpPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
    return filePath;
  }

  async load(sessionId: string): Promise<SessionCheckpoint | null> {
    const filePath = path.join(this.storePath, `${sessionId}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as SessionCheckpoint;
    } catch {
      return null;
    }
  }

  async list(): Promise<CheckpointSummary[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.storePath);
    const summaries: CheckpointSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(this.storePath, file), 'utf-8');
        const checkpoint = JSON.parse(data) as SessionCheckpoint;
        const totalCost = Object.values(checkpoint.costSpend).reduce((sum, c) => sum + c, 0);
        summaries.push({
          id: checkpoint.sessionId,
          timestamp: checkpoint.timestamp,
          task: checkpoint.task,
          mode: checkpoint.mode,
          status: checkpoint.metadata.status,
          cost: totalCost,
          turnCount: checkpoint.metadata.turnCount,
        });
      } catch {
        // Skip corrupted files
      }
    }

    return summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async delete(sessionId: string): Promise<boolean> {
    const filePath = path.join(this.storePath, `${sessionId}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async updateStatus(sessionId: string, status: SessionCheckpoint['metadata']['status']): Promise<void> {
    const checkpoint = await this.load(sessionId);
    if (checkpoint) {
      checkpoint.metadata.status = status;
      await this.save(checkpoint);
    }
  }
}
