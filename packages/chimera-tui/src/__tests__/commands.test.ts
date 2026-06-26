import { describe, it, expect, vi } from 'vitest';
import { runCommand, autocompleteCommand } from '../commands/commands.js';
import type { CommandContext } from '../commands/commands.js';

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    getMode: () => 'code',
    setMode: vi.fn(),
    getPreset: () => 'solo',
    setPreset: vi.fn(),
    getCostData: () => ({
      currentCost: 0.05,
      budget: 10,
      breakdown: [{
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.05,
      }],
    }),
    getHistory: () => ['hello', '/help', 'world'],
    sessionId: 'test-session-abc',
    ...overrides,
  };
}

describe('runCommand', () => {
  it('returns empty output for non-slash input', () => {
    const ctx = createMockContext();
    const result = runCommand('hello world', ctx);
    expect(result.output).toEqual([]);
  });

  it('/help returns help text', () => {
    const ctx = createMockContext();
    const result = runCommand('/help', ctx);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output.some((l) => l.includes('/mode'))).toBe(true);
  });

  it('/mode with valid mode calls setMode', () => {
    const ctx = createMockContext();
    const result = runCommand('/mode debug', ctx);
    expect(ctx.setMode).toHaveBeenCalledWith('debug');
    expect(result.output).toEqual(['Mode set to debug']);
  });

  it('/mode without args shows current mode', () => {
    const ctx = createMockContext();
    const result = runCommand('/mode', ctx);
    expect(result.output[0]).toContain('code');
  });

  it('/mode with invalid mode shows error', () => {
    const ctx = createMockContext();
    const result = runCommand('/mode invalid', ctx);
    expect(result.output[0]).toContain('Current mode');
  });

  it('/cost shows cost data', () => {
    const ctx = createMockContext();
    const result = runCommand('/cost', ctx);
    expect(result.output.some((l) => l.includes('test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('1000'))).toBe(true);
    expect(result.output.some((l) => l.includes('500'))).toBe(true);
  });

  it('/status shows session info', () => {
    const ctx = createMockContext();
    const result = runCommand('/status', ctx);
    expect(result.output.some((l) => l.includes('Session: test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('Mode: code'))).toBe(true);
    expect(result.output.some((l) => l.includes('History: 3'))).toBe(true);
  });

  it('/history shows command history', () => {
    const ctx = createMockContext();
    const result = runCommand('/history', ctx);
    expect(result.output).toEqual(['  1. hello', '  2. /help', '  3. world']);
  });

  it('/history with empty history', () => {
    const ctx = createMockContext({ getHistory: () => [] });
    const result = runCommand('/history', ctx);
    expect(result.output).toEqual(['No history yet.']);
  });

  it('/clear returns clearMessages flag', () => {
    const ctx = createMockContext();
    const result = runCommand('/clear', ctx);
    expect(result.clearMessages).toBe(true);
    expect(result.output).toEqual(['Chat cleared.']);
  });

  it('/exit returns exit flag', () => {
    const ctx = createMockContext();
    const result = runCommand('/exit', ctx);
    expect(result.exit).toBe(true);
    expect(result.output).toEqual(['Goodbye.']);
  });

  it('/quit returns exit flag', () => {
    const ctx = createMockContext();
    const result = runCommand('/quit', ctx);
    expect(result.exit).toBe(true);
  });

  it('/sessions returns viewHint', () => {
    const ctx = createMockContext();
    const result = runCommand('/sessions', ctx);
    expect(result.viewHint).toBe('sessions');
  });

  it('/diff returns viewHint', () => {
    const ctx = createMockContext();
    const result = runCommand('/diff', ctx);
    expect(result.viewHint).toBe('diff');
  });

  it('/agents returns viewHint', () => {
    const ctx = createMockContext();
    const result = runCommand('/agents', ctx);
    expect(result.viewHint).toBe('agents');
  });

  it('/events returns viewHint', () => {
    const ctx = createMockContext();
    const result = runCommand('/events', ctx);
    expect(result.viewHint).toBe('events');
  });

  it('unknown command returns error', () => {
    const ctx = createMockContext();
    const result = runCommand('/nonexistent', ctx);
    expect(result.output[0]).toContain('Unknown command');
  });
});

describe('autocompleteCommand', () => {
  it('returns all commands for "/" alone', () => {
    const matches = autocompleteCommand('/');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((c) => c.startsWith('/'))).toBe(true);
  });

  it('filters by prefix', () => {
    const matches = autocompleteCommand('/he');
    expect(matches).toEqual(['/help']);
  });

  it('returns multiple matches for ambiguous prefix', () => {
    const matches = autocompleteCommand('/c');
    expect(matches.includes('/clear')).toBe(true);
    expect(matches.includes('/cost')).toBe(true);
  });

  it('returns empty for non-slash input', () => {
    expect(autocompleteCommand('hello')).toEqual([]);
  });

  it('returns empty for no match', () => {
    expect(autocompleteCommand('/zzz')).toEqual([]);
  });
});
