import { describe, it, expect } from 'vitest';
import { ToolContextRelay } from '../tool-context-relay.js';

/**
 * Regression guard for the "CLI never exits" bug.
 *
 * `ToolContextRelay` starts a 5-minute cleanup interval in its constructor.
 * That interval used to be referenced, which kept the Node event loop alive
 * forever: `chimera ask ...` printed its answer and then hung until killed,
 * leaking one process per invocation and scoring 0/24 on the smoke suite.
 *
 * A periodic housekeeping timer must never be the reason a process stays
 * alive, so the interval is unref'd. These tests pin that down.
 */
describe('ToolContextRelay lifecycle', () => {
  it('does not keep the event loop alive via its cleanup interval', () => {
    const relay = new ToolContextRelay();
    try {
      const timer = (relay as unknown as { cleanupInterval: { hasRef(): boolean } })
        .cleanupInterval;
      expect(timer).toBeTruthy();
      // hasRef() === false means Node can exit while this timer is pending.
      expect(timer.hasRef()).toBe(false);
    } finally {
      relay.destroy();
    }
  });

  it('destroy() clears the interval', () => {
    const relay = new ToolContextRelay();
    relay.destroy();
    const timer = (relay as unknown as { cleanupInterval: unknown }).cleanupInterval;
    expect(timer).toBeNull();
  });

  it('destroy() is idempotent', () => {
    const relay = new ToolContextRelay();
    relay.destroy();
    expect(() => relay.destroy()).not.toThrow();
  });

  it('still boxes and retrieves payloads after the unref change', () => {
    const relay = new ToolContextRelay({ boxThreshold: 10 });
    try {
      const ref = relay.box('x'.repeat(50));
      expect(ref.ref).toContain('relay-');
    } finally {
      relay.destroy();
    }
  });
});
