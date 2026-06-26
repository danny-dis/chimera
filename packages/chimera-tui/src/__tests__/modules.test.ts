import { describe, it, expect } from 'vitest';

describe('tui-utils module', () => {
  it('exports all utility functions', async () => {
    const mod = await import('../components/tui-utils.js');
    expect(mod.statusSymbols).toBeDefined();
    expect(typeof mod.formatCost).toBe('function');
    expect(typeof mod.formatBudget).toBe('function');
    expect(typeof mod.budgetColor).toBe('function');
    expect(typeof mod.formatTime).toBe('function');
    expect(typeof mod.formatDateTime).toBe('function');
  });
});

describe('commands module', () => {
  it('exports runCommand and autocompleteCommand', async () => {
    const mod = await import('../commands/commands.js');
    expect(typeof mod.runCommand).toBe('function');
    expect(typeof mod.autocompleteCommand).toBe('function');
  });
});

describe('theme module', () => {
  it('exports zen theme and constants', async () => {
    const mod = await import('../theme.js');
    expect(mod.zen).toBeDefined();
    expect(typeof mod.MIN_COLUMNS).toBe('number');
    expect(typeof mod.MIN_ROWS).toBe('number');
  });
});

describe('syntax module', () => {
  it('exports tokenizeCode', async () => {
    const mod = await import('../syntax.js');
    expect(typeof mod.tokenizeCode).toBe('function');
  });
});

describe('use-commands hook', () => {
  it('exports useCommands', async () => {
    const mod = await import('../hooks/use-commands.js');
    expect(typeof mod.useCommands).toBe('function');
  });
});
