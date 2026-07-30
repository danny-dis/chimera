import { describe, it, expect } from 'vitest';
import { runCommand, autocompleteCommand } from '../commands/commands.js';
import type { CommandContext } from '../commands/commands.js';

const createMockContext = (overrides?: Partial<CommandContext>): CommandContext => ({
  getMode: () => 'code',
  setMode: async () => {},
  getPreset: () => 'solo',
  setPreset: async () => {},
  getCostData: () => ({ currentCost: 0, budget: 10, breakdown: [] }),
  getHistory: () => [],
  sessionId: 'test-session',
  runTask: async (_task: string, opts: { kind: 'loop' | 'goal'; maxIterations?: number }) =>
    ({
      status: opts.kind === 'loop' ? 'running' : 'running until achieved',
      output: 'ok',
      cost: 0,
    }),
  ...overrides,
});

describe('runCommand', async () => {
  it('returns empty output for non-slash input', async () => {
    const result = await runCommand('hello world', createMockContext());
    expect(result.output).toEqual([]);
  });

  it('returns help text for /help', async () => {
    const result = await runCommand('/help', createMockContext());
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output.some((line) => line.includes('Core commands'))).toBe(true);
  });

  it('sets mode with /mode', async () => {
    let newMode = 'code';
    const ctx = createMockContext({
      setMode: (m) => { newMode = m; },
    });
    const result = await runCommand('/mode plan', ctx);
    expect(newMode).toBe('plan');
    expect(result.output.some((line) => line.includes('Mode set to plan'))).toBe(true);
  });

  it('shows current mode with /mode no args', async () => {
    const result = await runCommand('/mode', createMockContext());
    expect(result.output.some((line) => line.includes('Current mode: code'))).toBe(true);
  });

  it('sets preset with /preset', async () => {
    let newPreset = 'solo';
    const ctx = createMockContext({
      setPreset: (p) => { newPreset = p; },
    });
    const result = await runCommand('/preset duo', ctx);
    expect(newPreset).toBe('duo');
    expect(result.output.some((line) => line.includes('Preset set to duo'))).toBe(true);
  });

  it('returns sessions viewHint for /sessions', async () => {
    const result = await runCommand('/sessions', createMockContext());
    expect(result.viewHint).toBe('sessions');
  });

  it('returns diff viewHint for /diff', async () => {
    const result = await runCommand('/diff', createMockContext());
    expect(result.viewHint).toBe('diff');
  });

  it('clears messages with /clear', async () => {
    const result = await runCommand('/clear', createMockContext());
    expect(result.clearMessages).toBe(true);
  });

  it('exits with /exit', async () => {
    const result = await runCommand('/exit', createMockContext());
    expect(result.exit).toBe(true);
  });

  it('exits with /quit', async () => {
    const result = await runCommand('/quit', createMockContext());
    expect(result.exit).toBe(true);
  });

  it('shows unknown command error', async () => {
    const result = await runCommand('/unknown', createMockContext());
    expect(result.output.some((line) => line.includes('Unknown command'))).toBe(true);
  });

  it('shows cost info with /cost', async () => {
    const ctx = createMockContext({
      getCostData: () => ({
        currentCost: 1.5,
        budget: 10,
        breakdown: [{ provider: 'openai', model: 'gpt-4', inputTokens: 100, outputTokens: 50, cost: 1.5 }],
      }),
    });
    const result = await runCommand('/cost', ctx);
    expect(result.output.some((line) => line.includes('$1.5000'))).toBe(true);
  });

  it('shows status with /status', async () => {
    const result = await runCommand('/status', createMockContext());
    expect(result.output.some((line) => line.includes('Session: test-session'))).toBe(true);
    expect(result.output.some((line) => line.includes('Mode: code'))).toBe(true);
  });

  it('shows history with /history', async () => {
    const ctx = createMockContext({
      getHistory: () => ['hello', 'world'],
    });
    const result = await runCommand('/history', ctx);
    expect(result.output.some((line) => line.includes('1. hello'))).toBe(true);
    expect(result.output.some((line) => line.includes('2. world'))).toBe(true);
  });

  it('shows empty history message', async () => {
    const result = await runCommand('/history', createMockContext());
    expect(result.output.some((line) => line.includes('No history yet'))).toBe(true);
  });

  it('validates /loop args', async () => {
    const result = await runCommand('/loop', createMockContext());
    expect(result.output.some((line) => line.includes('Usage'))).toBe(true);
  });

  it('validates /goal args', async () => {
    const result = await runCommand('/goal', createMockContext());
    expect(result.output.some((line) => line.includes('Usage'))).toBe(true);
  });
});

describe('autocompleteCommand', async () => {
  it('returns all commands for bare /', async () => {
    const matches = autocompleteCommand('/');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.startsWith('/'))).toBe(true);
  });

  it('filters by prefix', async () => {
    const matches = autocompleteCommand('/mo');
    expect(matches).toContain('/mode');
  });

  it('returns empty for non-slash input', async () => {
    const matches = autocompleteCommand('hello');
    expect(matches).toEqual([]);
  });

  it('returns empty for no match', async () => {
    const matches = autocompleteCommand('/xyz');
    expect(matches).toEqual([]);
  });
});
