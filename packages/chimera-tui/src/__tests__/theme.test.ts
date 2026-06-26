import { describe, it, expect } from 'vitest';
import { zen, MIN_COLUMNS, MIN_ROWS } from '../theme.js';

describe('zen theme', () => {
  it('has all required color keys', () => {
    expect(zen.bg).toBeDefined();
    expect(zen.fg).toBeDefined();
    expect(zen.accent).toBeDefined();
    expect(zen.muted).toBeDefined();
    expect(zen.success).toBeDefined();
    expect(zen.warning).toBeDefined();
    expect(zen.error).toBeDefined();
    expect(zen.info).toBeDefined();
    expect(zen.border).toBeDefined();
    expect(zen.borderActive).toBeDefined();
  });

  it('has role colors for all agent roles', () => {
    const expectedRoles = ['writer', 'reviewer', 'challenger', 'synthesizer', 'planner', 'researcher', 'summarizer'];
    for (const role of expectedRoles) {
      expect(zen.role[role]).toBeDefined();
    }
  });

  it('has syntax highlighting colors', () => {
    const expectedTokens = ['keyword', 'string', 'comment', 'number', 'function', 'type', 'plain'];
    for (const token of expectedTokens) {
      expect(zen.syntax[token]).toBeDefined();
    }
  });
});

describe('min size constants', () => {
  it('has reasonable minimums', () => {
    expect(MIN_COLUMNS).toBeGreaterThanOrEqual(80);
    expect(MIN_ROWS).toBeGreaterThanOrEqual(24);
  });
});
