import { describe, it, expect } from 'vitest';
import { runCommand, autocompleteCommand } from '../commands/commands.js';
import type { CommandContext } from '../commands/commands.js';

const createMockContext = (overrides?: Partial<CommandContext>): CommandContext => ({
  getMode: () => 'code',
  setMode: () => {},
  getPreset: () => 'solo',
  setPreset: () => {},
  getCostData: () => ({ currentCost: 0, budget: 10, breakdown: [] }),
  getHistory: () => [],
  sessionId: 'test-session',
  ...overrides,
});

describe('runCommand', () => {
  it('returns empty output for non-slash input', () => {
    const result = runCommand('hello world', createMockContext());
    expect(result.output).toEqual([]);
  });

  it('returns help text for /help', () => {
    const result = runCommand('/help', createMockContext());
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output.some((line) => line.includes('Core commands'))).toBe(true);
  });

  it('sets mode with /mode', () => {
    let newMode = 'code';
    const ctx = createMockContext({
      setMode: (m) => { newMode = m; },
    });
    const result = runCommand('/mode plan', ctx);
    expect(newMode).toBe('plan');
    expect(result.output.some((line) => line.includes('Mode set to plan'))).toBe(true);
  });

  it('shows current mode with /mode no args', () => {
    const result = runCommand('/mode', createMockContext());
    expect(result.output.some((line) => line.includes('Current mode: code'))).toBe(true);
  });

  it('sets preset with /preset', () => {
    let newPreset = 'solo';
    const ctx = createMockContext({
      setPreset: (p) => { newPreset = p; },
    });
    const result = runCommand('/preset duo', ctx);
    expect(newPreset).toBe('duo');
    expect(result.output.some((line) => line.includes('Preset set to duo'))).toBe(true);
  });

  it('returns sessions viewHint for /sessions', () => {
    const result = runCommand('/sessions', createMockContext());
    expect(result.viewHint).toBe('sessions');
  });

  it('returns diff viewHint for /diff', () => {
    const result = runCommand('/diff', createMockContext());
    expect(result.viewHint).toBe('diff');
  });

  it('clears messages with /clear', () => {
    const result = runCommand('/clear', createMockContext());
    expect(result.clearMessages).toBe(true);
  });

  it('exits with /exit', () => {
    const result = runCommand('/exit', createMockContext());
    expect(result.exit).toBe(true);
  });

  it('exits with /quit', () => {
    const result = runCommand('/quit', createMockContext());
    expect(result.exit).toBe(true);
  });

  it('shows unknown command error', () => {
    const result = runCommand('/unknown', createMockContext());
    expect(result.output.some((line) => line.includes('Unknown command'))).toBe(true);
  });

  it('shows cost info with /cost', () => {
    const ctx = createMockContext({
      getCostData: () => ({
        currentCost: 1.5,
        budget: 10,
        breakdown: [{ provider: 'openai', model: 'gpt-4', inputTokens: 100, outputTokens: 50, cost: 1.5 }],
      }),
    });
    const result = runCommand('/cost', ctx);
    expect(result.output.some((line) => line.includes('$1.5000'))).toBe(true);
  });

  it('shows status with /status', () => {
    const result = runCommand('/status', createMockContext());
    expect(result.output.some((line) => line.includes('Session: test-session'))).toBe(true);
    expect(result.output.some((line) => line.includes('Mode: code'))).toBe(true);
  });

  it('shows history with /history', () => {
    const ctx = createMockContext({
      getHistory: () => ['hello', 'world'],
    });
    const result = runCommand('/history', ctx);
    expect(result.output.some((line) => line.includes('1. hello'))).toBe(true);
    expect(result.output.some((line) => line.includes('2. world'))).toBe(true);
  });

  it('shows empty history message', () => {
    const result = runCommand('/history', createMockContext());
    expect(result.output.some((line) => line.includes('No history yet'))).toBe(true);
  });

  it('validates /loop args', () => {
    const result = runCommand('/loop', createMockContext());
    expect(result.output.some((line) => line.includes('Usage'))).toBe(true);
  });

  it('validates /goal args', () => {
    const result = runCommand('/goal', createMockContext());
    expect(result.output.some((line) => line.includes('Usage'))).toBe(true);
  });
});

describe('autocompleteCommand', () => {
  it('returns all commands for bare /', () => {
    const matches = autocompleteCommand('/');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.startsWith('/'))).toBe(true);
  });

  it('filters by prefix', () => {
    const matches = autocompleteCommand('/mo');
    expect(matches).toContain('/mode');
  });

  it('returns empty for non-slash input', () => {
    const matches = autocompleteCommand('hello');
    expect(matches).toEqual([]);
  });

  it('returns empty for no match', () => {
    const matches = autocompleteCommand('/xyz');
    expect(matches).toEqual([]);
  });
});
