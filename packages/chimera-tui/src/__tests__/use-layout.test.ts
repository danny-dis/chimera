import { describe, it, expect } from 'vitest';
import { MIN_COLUMNS, MIN_ROWS, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_CONTENT_OVERHEAD } from '../theme.js';

describe('layout computation', () => {
  it('min size constants are correct', () => {
    expect(MIN_COLUMNS).toBe(80);
    expect(MIN_ROWS).toBe(24);
  });

  it('sidebar width is clamped between min and max', () => {
    const clamp = (columns: number) => {
      const raw = Math.floor(columns * 0.3);
      return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, raw));
    };

    expect(clamp(80)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clamp(100)).toBe(30);
    expect(clamp(120)).toBe(36);
    expect(clamp(200)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('sidebar content width accounts for overhead', () => {
    const sidebarWidth = 36;
    const contentWidth = Math.max(0, sidebarWidth - SIDEBAR_CONTENT_OVERHEAD);
    expect(contentWidth).toBe(27);
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
