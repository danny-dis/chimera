import { randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────

export type AgentMemoryType = 'observation' | 'fact' | 'preference' | 'pattern';

export interface AgentMemoryItem {
  id: string;
  agentId: string;
  content: string;
  type: AgentMemoryType;
  confidence: number;
  createdAt: number;
  expiresAt?: number;
}

export interface AgentMemoryQuery {
  agentId?: string;
  type?: AgentMemoryType;
  minConfidence?: number;
  limit?: number;
}

export interface AgentMemorySnapshot {
  id: string;
  agentId: string;
  shortTerm: AgentMemoryItem[];
  longTerm: AgentMemoryItem[];
  createdAt: number;
}

// ── AgentMemory ────────────────────────────────────────────────────

export class AgentMemory {
  private shortTerm: AgentMemoryItem[] = [];
  private longTerm: AgentMemoryItem[] = [];
  private snapshots: Map<string, AgentMemorySnapshot> = new Map();

  private static readonly PROMOTION_THRESHOLD = 0.8;
  private static readonly SHORT_TERM_MAX = 100;

  /**
   * Record an observation for an agent.
   * Items are added to short-term memory and promoted to long-term
   * when confidence exceeds the threshold. Expired items are pruned.
   */
  async recordObservation(
    agentId: string,
    observation: Omit<AgentMemoryItem, 'id' | 'createdAt'>,
  ): Promise<void> {
    const item: AgentMemoryItem = {
      ...observation,
      id: randomUUID(),
      agentId,
      createdAt: Date.now(),
    };

    this.pruneExpired();

    if (item.confidence > AgentMemory.PROMOTION_THRESHOLD) {
      this.longTerm.push(item);
    } else {
      this.shortTerm.push(item);
      if (this.shortTerm.length > AgentMemory.SHORT_TERM_MAX) {
        this.shortTerm.shift();
      }
    }
  }

  /**
   * Create a point-in-time snapshot for an agent's memory state.
   */
  async createSnapshot(agentId: string): Promise<AgentMemorySnapshot> {
    const snapshot: AgentMemorySnapshot = {
      id: randomUUID(),
      agentId,
      shortTerm: [...this.shortTerm.filter((m) => m.agentId === agentId)],
      longTerm: [...this.longTerm.filter((m) => m.agentId === agentId)],
      createdAt: Date.now(),
    };

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Restore short-term and long-term memory from a snapshot.
   * Only memories belonging to the snapshot's agentId are restored.
   */
  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    this.shortTerm = [...snapshot.shortTerm];
    this.longTerm = [...snapshot.longTerm];
  }

  /**
   * Query memories across short-term and long-term storage.
   * Filters by agentId, type, and minimum confidence.
   * Results are sorted by confidence descending and limited.
   */
  async queryMemory(query: AgentMemoryQuery): Promise<AgentMemoryItem[]> {
    this.pruneExpired();

    const all = [...this.shortTerm, ...this.longTerm];

    let results = all;

    if (query.agentId) {
      results = results.filter((m) => m.agentId === query.agentId);
    }
    if (query.type) {
      results = results.filter((m) => m.type === query.type);
    }
    if (query.minConfidence !== undefined) {
      results = results.filter((m) => m.confidence >= query.minConfidence!);
    }

    results.sort((a, b) => b.confidence - a.confidence);

    if (query.limit !== undefined) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Remove items from short-term and long-term memory that have passed
   * their expiration time.
   */
  private pruneExpired(): void {
    const now = Date.now();
    this.shortTerm = this.shortTerm.filter(
      (m) => !m.expiresAt || m.expiresAt > now,
    );
    this.longTerm = this.longTerm.filter(
      (m) => !m.expiresAt || m.expiresAt > now,
    );
  }
}
