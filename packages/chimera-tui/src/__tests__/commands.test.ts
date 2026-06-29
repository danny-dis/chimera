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

  it('/preset with valid preset calls setPreset', () => {
    const ctx = createMockContext();
    const result = runCommand('/preset duo', ctx);
    expect(ctx.setPreset).toHaveBeenCalledWith('duo');
    expect(result.output).toEqual(['Preset set to duo']);
  });

  it('/preset without args shows current preset', () => {
    const ctx = createMockContext();
    const result = runCommand('/preset', ctx);
    expect(result.output[0]).toContain('solo');
  });

  it('/cost shows cost data', () => {
    const ctx = createMockContext();
    const result = runCommand('/cost', ctx);
    expect(result.output.some((l) => l.includes('test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('1000'))).toBe(true);
    expect(result.output.some((l) => l.includes('500'))).toBe(true);
  });

  it('/cost shows aggregate when available', () => {
    const ctx = createMockContext({ getAggregateCost: () => 1.2345 });
    const result = runCommand('/cost', ctx);
    expect(result.output.some((l) => l.includes('Aggregate: $1.2345'))).toBe(true);
  });

  it('/status shows session info', () => {
    const ctx = createMockContext();
    const result = runCommand('/status', ctx);
    expect(result.output.some((l) => l.includes('Session: test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('Mode: code'))).toBe(true);
    expect(result.output.some((l) => l.includes('History: 3'))).toBe(true);
  });

  it('/status shows loop state when available', () => {
    const ctx = createMockContext({
      getLoopState: () => ({
        kind: 'loop',
        task: 'test task',
        maxIterations: 5,
        currentIteration: 3,
        status: 'running',
        startedAt: Date.now() - 10000,
      }),
    });
    const result = runCommand('/status', ctx);
    expect(result.output.some((l) => l.includes('Loop'))).toBe(true);
    expect(result.output.some((l) => l.includes('3/5'))).toBe(true);
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

  it('/tasks shows no tasks when no orchestrator', () => {
    const ctx = createMockContext();
    const result = runCommand('/tasks', ctx);
    expect(result.output[0]).toContain('No tasks run yet');
  });

  it('/tasks shows task counts when orchestrator is active', () => {
    const ctx = createMockContext({
      hasOrchestrator: () => true,
      getEventStream: () => ({
        getAll: () => [
          { type: 'agent_spawned', agentId: 'a1', role: 'writer', provider: 'openai', model: 'gpt-4' },
          { type: 'agent_spawned', agentId: 'a2', role: 'reviewer', provider: 'openai', model: 'gpt-4' },
          { type: 'draft_proposed' },
          { type: 'verified' },
        ],
      }),
    });
    const result = runCommand('/tasks', ctx);
    expect(result.output.some((l) => l.includes('Agents spawned: 2'))).toBe(true);
    expect(result.output.some((l) => l.includes('Drafts proposed: 1'))).toBe(true);
    expect(result.output.some((l) => l.includes('Verifications: 1'))).toBe(true);
  });

  it('/todos is alias of /tasks', () => {
    const ctx = createMockContext();
    const result = runCommand('/todos', ctx);
    expect(result.output[0]).toContain('No tasks run yet');
  });

  it('/compact shows nothing when history empty', () => {
    const ctx = createMockContext({ getHistory: () => [] });
    const result = runCommand('/compact', ctx);
    expect(result.output[0]).toContain('Nothing to compact');
  });

  it('/compact shows error when memory unavailable', () => {
    const ctx = createMockContext({ getHistory: () => ['task1'] });
    const result = runCommand('/compact', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/compact succeeds when memory is available', () => {
    const ctx = createMockContext({
      getHistory: () => ['task1'],
      getMemorySize: () => 5,
    });
    const result = runCommand('/compact', ctx);
    expect(result.output.some((l) => l.includes('Compacted'))).toBe(true);
  });

  it('/loop shows usage without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/loop', ctx);
    expect(result.output[0]).toContain('Usage');
  });

  it('/loop with valid args returns output', () => {
    const ctx = createMockContext();
    const result = runCommand('/loop 3 do something', ctx);
    expect(result.output.some((l) => l.includes('running'))).toBe(true);
  });

  it('/goal shows usage without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/goal', ctx);
    expect(result.output[0]).toContain('Usage');
  });

  it('/goal with args returns output', () => {
    const ctx = createMockContext();
    const result = runCommand('/goal all tests pass', ctx);
    expect(result.output.some((l) => l.includes('running until achieved'))).toBe(true);
  });

  it('/model shows unavailable when no providers', () => {
    const ctx = createMockContext();
    const result = runCommand('/model', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/theme shows available themes without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/theme', ctx);
    expect(result.output.some((l) => l.includes('Available themes'))).toBe(true);
  });

  it('/theme with valid theme returns output', () => {
    const ctx = createMockContext();
    const result = runCommand('/theme dark', ctx);
    expect(result.output[0]).toContain('Theme set to');
  });

  it('/theme with invalid theme shows error', () => {
    const ctx = createMockContext();
    const result = runCommand('/theme rainbow', ctx);
    expect(result.output[0]).toContain('Unknown theme');
  });

  it('/output-style shows available styles without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/output-style', ctx);
    expect(result.output.some((l) => l.includes('Available output styles'))).toBe(true);
  });

  it('/permissions shows permission info', () => {
    const ctx = createMockContext();
    const result = runCommand('/permissions', ctx);
    expect(result.output.some((l) => l.includes('Permission mode'))).toBe(true);
  });

  it('/sandbox shows sandbox info', () => {
    const ctx = createMockContext();
    const result = runCommand('/sandbox', ctx);
    expect(result.output.some((l) => l.includes('Sandbox status'))).toBe(true);
  });

  it('/login shows login info without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/login', ctx);
    expect(result.output.some((l) => l.includes('Not logged in'))).toBe(true);
  });

  it('/login with invalid email shows error', () => {
    const ctx = createMockContext();
    const result = runCommand('/login notanemail', ctx);
    expect(result.output[0]).toContain('valid email');
  });

  it('/login with valid email authenticates', () => {
    const ctx = createMockContext();
    const result = runCommand('/login user@example.com', ctx);
    expect(result.output.some((l) => l.includes('Authenticated'))).toBe(true);
  });

  it('/logout returns output', () => {
    const ctx = createMockContext();
    const result = runCommand('/logout', ctx);
    expect(result.output.some((l) => l.includes('Logged out'))).toBe(true);
  });

  it('/memory shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/memory', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/memory shows entries when available', () => {
    const ctx = createMockContext({
      getMemorySize: () => 3,
      getMemoryEntries: () => [
        { content: 'memory 1', metadata: { topic: 'code' } },
        { content: 'memory 2', metadata: { topic: 'code' } },
        { content: 'memory 3', metadata: { topic: 'plan' } },
      ],
    });
    const result = runCommand('/memory', ctx);
    expect(result.output.some((l) => l.includes('Memory: 3 entries'))).toBe(true);
    expect(result.output.some((l) => l.includes('code: 2'))).toBe(true);
    expect(result.output.some((l) => l.includes('plan: 1'))).toBe(true);
  });

  it('/mcp shows config info', () => {
    const ctx = createMockContext();
    const result = runCommand('/mcp', ctx);
    expect(result.output.some((l) => l.includes('No MCP servers'))).toBe(true);
  });

  it('/hooks shows config info', () => {
    const ctx = createMockContext();
    const result = runCommand('/hooks', ctx);
    expect(result.output.some((l) => l.includes('No hooks registered'))).toBe(true);
  });

  it('/ide shows connection info', () => {
    const ctx = createMockContext();
    const result = runCommand('/ide', ctx);
    expect(result.output.some((l) => l.includes('IDE connection'))).toBe(true);
  });

  it('/doctor shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/doctor', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/bug shows diagnostics', () => {
    const ctx = createMockContext();
    const result = runCommand('/bug', ctx);
    expect(result.output.some((l) => l.includes('Bug report'))).toBe(true);
  });

  it('/feedback shows feedback info', () => {
    const ctx = createMockContext();
    const result = runCommand('/feedback', ctx);
    expect(result.output.some((l) => l.includes('Feedback'))).toBe(true);
  });

  it('/usage shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/usage', ctx);
    expect(result.output[0]).toContain('No token usage');
  });

  it('/usage shows token usage when available', () => {
    const ctx = createMockContext({
      getTokenUsage: () => [
        { role: 'writer', spend: 0.5 },
        { role: 'reviewer', spend: 0.3 },
      ],
    });
    const result = runCommand('/usage', ctx);
    expect(result.output.some((l) => l.includes('writer'))).toBe(true);
    expect(result.output.some((l) => l.includes('reviewer'))).toBe(true);
    expect(result.output.some((l) => l.includes('$0.8000'))).toBe(true);
  });

  it('/release-notes shows output', () => {
    const ctx = createMockContext();
    const result = runCommand('/release-notes', ctx);
    expect(result.output.some((l) => l.includes('release notes'))).toBe(true);
  });

  it('/pr-comments shows auth info', () => {
    const ctx = createMockContext();
    const result = runCommand('/pr-comments', ctx);
    expect(result.output.some((l) => l.includes('Not authenticated'))).toBe(true);
  });

  it('/privacy-settings shows settings', () => {
    const ctx = createMockContext();
    const result = runCommand('/privacy-settings', ctx);
    expect(result.output.some((l) => l.includes('Privacy settings'))).toBe(true);
  });

  it('/migrate-installer shows status', () => {
    const ctx = createMockContext();
    const result = runCommand('/migrate-installer', ctx);
    expect(result.output.some((l) => l.includes('No migration needed'))).toBe(true);
  });

  it('/teleport shows usage without args', () => {
    const ctx = createMockContext();
    const result = runCommand('/teleport', ctx);
    expect(result.output.some((l) => l.includes('Teleport'))).toBe(true);
  });

  it('/config shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/config', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/vim toggles vim mode', () => {
    const ctx = createMockContext();
    const result = runCommand('/vim', ctx);
    expect(result.output.some((l) => l.includes('Vim mode'))).toBe(true);
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

  it('/agents shows message when no orchestrator', () => {
    const ctx = createMockContext();
    const result = runCommand('/agents', ctx);
    expect(result.viewHint).toBe('agents');
  });

  it('/agents shows spawned agents when available', () => {
    const ctx = createMockContext({
      getEventStream: () => ({
        getAll: () => [
          { type: 'agent_spawned', agentId: 'a1', role: 'writer', provider: 'openai', model: 'gpt-4' },
        ],
      }),
    });
    const result = runCommand('/agents', ctx);
    expect(result.output.some((l) => l.includes('Agents (1 total)'))).toBe(true);
  });

  it('/events returns viewHint', () => {
    const ctx = createMockContext();
    const result = runCommand('/events', ctx);
    expect(result.viewHint).toBe('events');
  });

  it('/resume shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/resume', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/rewind shows unavailable when not provided', () => {
    const ctx = createMockContext();
    const result = runCommand('/rewind', ctx);
    expect(result.output[0]).toContain('not available');
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

  it('includes new commands in autocomplete', () => {
    const matches = autocompleteCommand('/m');
    expect(matches.includes('/mode')).toBe(true);
    expect(matches.includes('/model')).toBe(true);
    expect(matches.includes('/memory')).toBe(true);
  });
});
