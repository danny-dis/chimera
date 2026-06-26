export interface BoxedPayload {
  id: string;
  data: string;
  tokens: number;
  createdAt: number;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}

export interface RelayReference {
  ref: string;
  sliceHint?: { start: number; end: number };
}

interface RelayConfig {
  defaultTtlMs: number;
  maxStoreSize: number;
  boxThreshold: number;
}

const DEFAULT_CONFIG: RelayConfig = {
  defaultTtlMs: 24 * 60 * 60 * 1000,
  maxStoreSize: 1000,
  boxThreshold: 2000,
};

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REF_PATTERN = /internal:\/\/relay-[\w-]+/g;

let globalCounter = 0;

function generateId(): string {
  return `relay-${Date.now()}-${globalCounter++}`;
}

function estimateTokens(data: string): number {
  return Math.ceil(data.length / 4);
}

export class ToolContextRelay {
  private store: Map<string, BoxedPayload> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private config: RelayConfig;

  constructor(params?: {
    defaultTtlMs?: number;
    maxStoreSize?: number;
    boxThreshold?: number;
  }) {
    this.config = {
      defaultTtlMs: params?.defaultTtlMs ?? DEFAULT_CONFIG.defaultTtlMs,
      maxStoreSize: params?.maxStoreSize ?? DEFAULT_CONFIG.maxStoreSize,
      boxThreshold: params?.boxThreshold ?? DEFAULT_CONFIG.boxThreshold,
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  box(
    data: string,
    options?: { ttlMs?: number; metadata?: Record<string, unknown> },
  ): RelayReference {
    const id = generateId();
    const ttlMs = options?.ttlMs ?? this.config.defaultTtlMs;

    const payload: BoxedPayload = {
      id,
      data,
      tokens: estimateTokens(data),
      createdAt: Date.now(),
      ttlMs,
      metadata: options?.metadata,
    };

    this.evictOldestIfNeeded();
    this.store.set(id, payload);

    return { ref: `internal://${id}` };
  }

  unbox(ref: RelayReference): string | null {
    const id = this.extractIdFromRef(ref.ref);
    if (!id) return null;

    const payload = this.store.get(id);
    if (!payload) return null;
    if (this.isExpired(payload)) {
      this.store.delete(id);
      return null;
    }

    return payload.data;
  }

  readSlice(ref: RelayReference, start: number, end: number): string | null {
    const full = this.unbox(ref);
    if (full === null) return null;

    const sliced = full.slice(start, end);
    return sliced;
  }

  isRelayReference(value: string): boolean {
    return /^internal:\/\/relay-[\w-]+$/.test(value);
  }

  extractReferences(text: string): RelayReference[] {
    const refs: RelayReference[] = [];
    let match: RegExpExecArray | null;

    REF_PATTERN.lastIndex = 0;
    while ((match = REF_PATTERN.exec(text)) !== null) {
      const refStr = match[0];
      if (this.store.has(this.extractId(refStr))) {
        refs.push({ ref: refStr });
      }
    }

    return refs;
  }

  resolveReferences(text: string): string {
    return text.replace(REF_PATTERN, (match) => {
      const id = this.extractId(match);
      const payload = this.store.get(id);
      if (!payload || this.isExpired(payload)) return match;
      return payload.data;
    });
  }

  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [id, payload] of this.store) {
      if (now - payload.createdAt >= payload.ttlMs) {
        this.store.delete(id);
        removed++;
      }
    }

    return removed;
  }

  getStats(): {
    totalPayloads: number;
    totalTokens: number;
    oldestAge: number | null;
  } {
    let totalTokens = 0;
    let oldestCreatedAt = Infinity;

    for (const payload of this.store.values()) {
      totalTokens += payload.tokens;
      if (payload.createdAt < oldestCreatedAt) {
        oldestCreatedAt = payload.createdAt;
      }
    }

    return {
      totalPayloads: this.store.size,
      totalTokens,
      oldestAge: this.store.size > 0 ? Date.now() - oldestCreatedAt : null,
    };
  }

  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }

  private extractIdFromRef(ref: string): string | null {
    if (!ref.startsWith('internal://')) return null;
    return ref.slice('internal://'.length);
  }

  private extractId(ref: string): string {
    return ref.slice('internal://'.length);
  }

  private isExpired(payload: BoxedPayload): boolean {
    return Date.now() - payload.createdAt >= payload.ttlMs;
  }

  private evictOldestIfNeeded(): void {
    while (this.store.size >= this.config.maxStoreSize) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;

      for (const [id, payload] of this.store) {
        if (payload.createdAt < oldestTime) {
          oldestTime = payload.createdAt;
          oldestId = id;
        }
      }

      if (oldestId) {
        this.store.delete(oldestId);
      } else {
        break;
      }
    }
  }
}
