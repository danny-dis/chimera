// =============================================================================
// LeaseManager — distributed-style leases with heartbeats for stale-run
// detection. Tracks which runs are actively being processed and detects
// runs whose owner has crashed or become unresponsive.
// =============================================================================

import { randomUUID } from 'node:crypto';

export interface Lease {
  id: string;
  runId: string;
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
  lastHeartbeatAt: number;
  metadata?: Record<string, unknown>;
}

export interface LeaseManagerOptions {
  /** How long a lease is valid without heartbeat (ms) */
  leaseTtlMs: number;
  /** How often to check for expired leases (ms) */
  cleanupIntervalMs: number;
  /** Optional callback when a lease expires (e.g. to mark run as failed) */
  onLeaseExpired?: (lease: Lease) => void;
}

const DEFAULT_OPTIONS: LeaseManagerOptions = {
  leaseTtlMs: 30_000,      // 30s without heartbeat = expired
  cleanupIntervalMs: 5_000, // Check every 5s
};

/**
 * LeaseManager — tracks active runs via leases with heartbeats.
 * 
 * A run acquires a lease before starting work. The owner must periodically
 * heartbeat to keep the lease alive. If the owner crashes or becomes
 * unresponsive, the lease expires and the run can be recovered.
 */
export class LeaseManager {
  private leases = new Map<string, Lease>();
  private options: LeaseManagerOptions;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: Partial<LeaseManagerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start the background cleanup process that detects expired leases.
   */
  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.options.cleanupIntervalMs);
    // Don't keep the process alive just for this timer
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the background cleanup process.
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Acquire a lease for a run. Fails if the run already has an active lease
   * owned by someone else.
   */
  acquireLease(runId: string, ownerId: string, metadata?: Record<string, unknown>): Lease | null {
    const existing = this.leases.get(runId);
    if (existing && existing.ownerId !== ownerId && existing.expiresAt > Date.now()) {
      // Lease held by someone else and not expired
      return null;
    }

    const now = Date.now();
    const lease: Lease = {
      id: randomUUID(),
      runId,
      ownerId,
      acquiredAt: now,
      expiresAt: now + this.options.leaseTtlMs,
      lastHeartbeatAt: now,
      metadata,
    };
    this.leases.set(runId, lease);
    return lease;
  }

  /**
   * Heartbeat to keep a lease alive. Returns false if the lease doesn't
   * exist or is owned by someone else.
   */
  heartbeat(runId: string, ownerId: string): boolean {
    const lease = this.leases.get(runId);
    if (!lease || lease.ownerId !== ownerId) return false;
    const now = Date.now();
    lease.lastHeartbeatAt = now;
    lease.expiresAt = now + this.options.leaseTtlMs;
    return true;
  }

  /**
   * Release a lease (e.g. when a run completes normally).
   */
  releaseLease(runId: string, ownerId: string): boolean {
    const lease = this.leases.get(runId);
    if (!lease || lease.ownerId !== ownerId) return false;
    this.leases.delete(runId);
    return true;
  }

  /**
   * Check if a run has an active (non-expired) lease.
   */
  isLeased(runId: string): boolean {
    const lease = this.leases.get(runId);
    return lease !== undefined && lease.expiresAt > Date.now();
  }

  /**
   * Get the lease for a run, or null if none exists.
   */
  getLease(runId: string): Lease | null {
    return this.leases.get(runId) ?? null;
  }

  /**
   * Get all active (non-expired) leases.
   */
  getActiveLeases(): Lease[] {
    const now = Date.now();
    return [...this.leases.values()].filter(l => l.expiresAt > now);
  }

  /**
   * Get all expired leases and remove them from the active set.
   * Calls the onLeaseExpired callback for each.
   */
  cleanupExpired(): Lease[] {
    const now = Date.now();
    const expired: Lease[] = [];
    for (const [runId, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        expired.push(lease);
        this.leases.delete(runId);
        this.options.onLeaseExpired?.(lease);
      }
    }
    return expired;
  }

  /**
   * Force-expire a lease regardless of TTL. Used for admin operations.
   */
  forceExpire(runId: string): Lease | null {
    const lease = this.leases.get(runId);
    if (!lease) return null;
    this.leases.delete(runId);
    return lease;
  }

  /**
   * Get the number of active leases.
   */
  get activeLeaseCount(): number {
    return this.getActiveLeases().length;
  }
}
