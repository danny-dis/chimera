import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LeaseManager } from './lease-manager.js';

describe('LeaseManager', () => {
  let manager: LeaseManager;

  beforeEach(() => {
    manager = new LeaseManager({ leaseTtlMs: 100, cleanupIntervalMs: 50 });
  });

  afterEach(() => {
    manager.stop();
  });

  it('acquires a lease', () => {
    const lease = manager.acquireLease('run-1', 'owner-1');
    expect(lease).not.toBeNull();
    expect(lease?.runId).toBe('run-1');
    expect(lease?.ownerId).toBe('owner-1');
  });

  it('fails to acquire lease held by another owner', () => {
    manager.acquireLease('run-1', 'owner-1');
    const lease2 = manager.acquireLease('run-1', 'owner-2');
    expect(lease2).toBeNull();
  });

  it('allows same owner to re-acquire', () => {
    manager.acquireLease('run-1', 'owner-1');
    const lease2 = manager.acquireLease('run-1', 'owner-1');
    expect(lease2).not.toBeNull();
  });

  it('checks if a run is leased', () => {
    expect(manager.isLeased('run-1')).toBe(false);
    manager.acquireLease('run-1', 'owner-1');
    expect(manager.isLeased('run-1')).toBe(true);
  });

  it('heartbeats keep lease alive', () => {
    manager.acquireLease('run-1', 'owner-1');
    expect(manager.heartbeat('run-1', 'owner-1')).toBe(true);
    expect(manager.isLeased('run-1')).toBe(true);
  });

  it('rejects heartbeat from wrong owner', () => {
    manager.acquireLease('run-1', 'owner-1');
    expect(manager.heartbeat('run-1', 'owner-2')).toBe(false);
  });

  it('releases a lease', () => {
    manager.acquireLease('run-1', 'owner-1');
    expect(manager.releaseLease('run-1', 'owner-1')).toBe(true);
    expect(manager.isLeased('run-1')).toBe(false);
  });

  it('rejects release from wrong owner', () => {
    manager.acquireLease('run-1', 'owner-1');
    expect(manager.releaseLease('run-1', 'owner-2')).toBe(false);
    expect(manager.isLeased('run-1')).toBe(true);
  });

  it('gets active leases', () => {
    manager.acquireLease('run-1', 'owner-1');
    manager.acquireLease('run-2', 'owner-2');
    expect(manager.getActiveLeases()).toHaveLength(2);
  });

  it('force-expires a lease', () => {
    manager.acquireLease('run-1', 'owner-1');
    const expired = manager.forceExpire('run-1');
    expect(expired).not.toBeNull();
    expect(manager.isLeased('run-1')).toBe(false);
  });

  it('detects expired leases via cleanup', async () => {
    manager.acquireLease('run-1', 'owner-1');
    // Don't start background timer — we're testing cleanupExpired() directly
    // Wait for lease to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    const expired = manager.cleanupExpired();
    expect(expired).toHaveLength(1);
    expect(expired[0].runId).toBe('run-1');
  });

  it('calls onLeaseExpired callback', async () => {
    const onExpired = vi.fn();
    const mgr = new LeaseManager({ leaseTtlMs: 50, cleanupIntervalMs: 20, onLeaseExpired: onExpired });
    mgr.acquireLease('run-1', 'owner-1');
    mgr.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    mgr.stop();
    expect(onExpired).toHaveBeenCalledOnce();
  });
});
