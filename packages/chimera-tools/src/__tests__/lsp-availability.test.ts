import { describe, it, expect } from 'vitest';
import { getTypeScriptServerAvailability, isTypeScriptServerAvailable } from '../lsp-registry.js';

// Offline, bounded, no installs, no spawns: resolve-only probe.
// Distinct from REAL-server proof in lsp-tool.test.ts.
describe('TypeScript server availability (offline probe)', () => {
  it('returns an explicit available/unavailable signal (never empty success)', () => {
    const result = getTypeScriptServerAvailability(process.cwd());
    expect(typeof result.available).toBe('boolean');
    expect(typeof result.command).toBe('string');
    expect(Array.isArray(result.args)).toBe(true);
    if (!result.available) {
      expect(result.reason ?? '').toContain('no install attempted');
    }
    expect(isTypeScriptServerAvailable(process.cwd())).toBe(result.available);
  });
});
