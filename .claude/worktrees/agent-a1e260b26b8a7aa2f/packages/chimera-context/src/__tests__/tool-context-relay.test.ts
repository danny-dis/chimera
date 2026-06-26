import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolContextRelay } from '../tool-context-relay.js';

describe('ToolContextRelay', () => {
  let relay: ToolContextRelay;

  beforeEach(() => {
    relay = new ToolContextRelay({ defaultTtlMs: 60_000, maxStoreSize: 10 });
  });

  afterEach(() => {
    relay.destroy();
  });

  describe('box / unbox', () => {
    it('stores payload and returns reference', () => {
      const ref = relay.box('hello world');
      expect(ref.ref).toMatch(/^internal:\/\/relay-/);
    });

    it('retrieves payload from reference', () => {
      const ref = relay.box('test data');
      const data = relay.unbox(ref);
      expect(data).toBe('test data');
    });

    it('returns null for invalid reference', () => {
      const data = relay.unbox({ ref: 'invalid://ref' });
      expect(data).toBeNull();
    });

    it('stores metadata', () => {
      const ref = relay.box('data', { metadata: { source: 'test' } });
      const stats = relay.getStats();
      expect(stats.totalPayloads).toBe(1);
    });
  });

  describe('readSlice', () => {
    it('reads a slice of stored payload', () => {
      const ref = relay.box('abcdefghij');
      const slice = relay.readSlice(ref, 2, 5);
      expect(slice).toBe('cde');
    });

    it('returns null for invalid ref', () => {
      const slice = relay.readSlice({ ref: 'invalid://ref' }, 0, 5);
      expect(slice).toBeNull();
    });
  });

  describe('isRelayReference', () => {
    it('correctly identifies references', () => {
      expect(relay.isRelayReference('internal://relay-123-0')).toBe(true);
      expect(relay.isRelayReference('not-a-ref')).toBe(false);
      expect(relay.isRelayReference('http://example.com')).toBe(false);
    });
  });

  describe('extractReferences', () => {
    it('extracts all references from text', () => {
      const ref1 = relay.box('data1');
      const ref2 = relay.box('data2');
      const text = `Check ${ref1.ref} and ${ref2.ref} for details`;

      const refs = relay.extractReferences(text);
      expect(refs).toHaveLength(2);
      expect(refs.map(r => r.ref)).toContain(ref1.ref);
      expect(refs.map(r => r.ref)).toContain(ref2.ref);
    });

    it('returns empty array when no references', () => {
      const refs = relay.extractReferences('no refs here');
      expect(refs).toHaveLength(0);
    });
  });

  describe('resolveReferences', () => {
    it('replaces references with actual data', () => {
      const ref = relay.box('resolved content');
      const text = `Before ${ref.ref} after`;
      const resolved = relay.resolveReferences(text);
      expect(resolved).toBe('Before resolved content after');
    });

    it('leaves unknown references as-is', () => {
      const text = 'Before internal://relay-unknown after';
      const resolved = relay.resolveReferences(text);
      expect(resolved).toBe(text);
    });
  });

  describe('cleanup', () => {
    it('removes expired payloads', () => {
      const shortRelay = new ToolContextRelay({ defaultTtlMs: 1 });
      shortRelay.box('expire me');
      expect(shortRelay.getStats().totalPayloads).toBe(1);

      // Wait for TTL to expire
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin wait */ }

      const removed = shortRelay.cleanup();
      expect(removed).toBe(1);
      expect(shortRelay.getStats().totalPayloads).toBe(0);
      shortRelay.destroy();
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      relay.box('short');
      relay.box('a longer payload here');

      const stats = relay.getStats();
      expect(stats.totalPayloads).toBe(2);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.oldestAge).toBeGreaterThanOrEqual(0);
    });

    it('returns null oldestAge when empty', () => {
      const emptyRelay = new ToolContextRelay();
      const stats = emptyRelay.getStats();
      expect(stats.totalPayloads).toBe(0);
      expect(stats.oldestAge).toBeNull();
      emptyRelay.destroy();
    });
  });

  describe('TTL expiry', () => {
    it('payloads expire after TTL', () => {
      const shortRelay = new ToolContextRelay({ defaultTtlMs: 1 });
      const ref = shortRelay.box('will expire');

      const start = Date.now();
      while (Date.now() - start < 5) { /* spin wait */ }

      const data = shortRelay.unbox(ref);
      expect(data).toBeNull();
      shortRelay.destroy();
    });
  });

  describe('LRU eviction', () => {
    it('oldest payload evicted when store full', () => {
      const smallRelay = new ToolContextRelay({ maxStoreSize: 3 });
      const ref1 = smallRelay.box('first');
      smallRelay.box('second');
      smallRelay.box('third');
      smallRelay.box('fourth');

      expect(smallRelay.getStats().totalPayloads).toBe(3);
      expect(smallRelay.unbox(ref1)).toBeNull();
      smallRelay.destroy();
    });
  });
});
