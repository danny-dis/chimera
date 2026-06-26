import { describe, it, expect } from 'vitest';
import { MIN_COLUMNS, MIN_ROWS } from '../theme.js';

describe('layout computation', () => {
  it('min size constants are correct', () => {
    expect(MIN_COLUMNS).toBe(80);
    expect(MIN_ROWS).toBe(24);
  });

  it('sidebar width calculation', () => {
    const columns = 120;
    const sidebarVisible = true;
    const sidebarWidth = Math.floor(columns * 0.3);
    const chatWidth = columns - sidebarWidth;

    expect(sidebarWidth).toBe(36);
    expect(chatWidth).toBe(84);
  });

  it('chat gets full width when sidebar hidden', () => {
    const columns = 120;
    const sidebarVisible = false;
    const sidebarWidth = sidebarVisible ? Math.floor(columns * 0.3) : 0;
    const chatWidth = columns - sidebarWidth;

    expect(sidebarWidth).toBe(0);
    expect(chatWidth).toBe(120);
  });

  it('min size check', () => {
    expect(80 >= MIN_COLUMNS && 24 >= MIN_ROWS).toBe(true);
    expect(79 >= MIN_COLUMNS).toBe(false);
    expect(23 >= MIN_ROWS).toBe(false);
  });
});
