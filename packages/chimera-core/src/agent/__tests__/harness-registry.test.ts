import { describe, it, expect } from 'vitest';
import { createDefaultHarnessRegistry, HarnessRegistry } from '../harness-registry.js';

describe('HarnessRegistry', () => {
  it('registers the native chimera harness by default', () => {
    const r = createDefaultHarnessRegistry();
    expect(r.has('chimera')).toBe(true);
    expect(r.getDefault()?.id).toBe('chimera');
  });

  it('registers the hermes gateway so createProvider does not throw', async () => {
    const r = createDefaultHarnessRegistry();
    expect(r.has('hermes')).toBe(true);
    const provider = await r.createProvider('hermes', {});
    expect(provider).toBeDefined();
  });

  it('still throws an honest error for backends that are declared but not registered', async () => {
    const r = createDefaultHarnessRegistry();
    await expect(r.createProvider('codex', {})).rejects.toThrow(/not found/i);
    await expect(r.createProvider('opencode', {})).rejects.toThrow(/not found/i);
  });

  it('rejects duplicate registration', () => {
    const r = new HarnessRegistry();
    r.register({ id: 'chimera', displayName: 'x', supportsSessionResume: false, supportsMcp: false, supportsHooks: false, factory: async () => ({} as never) });
    expect(() => r.register({ id: 'chimera', displayName: 'y', supportsSessionResume: false, supportsMcp: false, supportsHooks: false, factory: async () => ({} as never) })).toThrow(/already registered/i);
  });
});
