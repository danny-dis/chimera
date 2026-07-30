import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    runTask: async (_task: string, opts: { kind: 'loop' | 'goal'; maxIterations?: number }) =>
      ({
        status: opts.kind === 'loop' ? 'running' : 'running until achieved',
        output: 'ok',
        cost: 0,
      }),
    ...overrides,
  };
}

describe('runCommand', async () => {
  it('returns empty output for non-slash input', async () => {
    const ctx = createMockContext();
    const result = await runCommand('hello world', ctx);
    expect(result.output).toEqual([]);
  });

  it('/help returns help text', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/help', ctx);
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output.some((l) => l.includes('/mode'))).toBe(true);
  });

  it('/mode with valid mode calls setMode', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/mode debug', ctx);
    expect(ctx.setMode).toHaveBeenCalledWith('debug');
    expect(result.output).toEqual(['Mode set to debug']);
  });

  it('/mode without args shows current mode', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/mode', ctx);
    expect(result.output[0]).toContain('code');
  });

  it('/mode with invalid mode shows error', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/mode invalid', ctx);
    expect(result.output[0]).toContain('Current mode');
  });

  it('/preset with valid preset calls setPreset', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/preset duo', ctx);
    expect(ctx.setPreset).toHaveBeenCalledWith('duo');
    expect(result.output).toEqual(['Preset set to duo']);
  });

  it('/preset without args shows current preset', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/preset', ctx);
    expect(result.output[0]).toContain('solo');
  });

  it('/cost shows cost data', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/cost', ctx);
    expect(result.output.some((l) => l.includes('test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('1000'))).toBe(true);
    expect(result.output.some((l) => l.includes('500'))).toBe(true);
  });

  it('/cost shows aggregate when available', async () => {
    const ctx = createMockContext({ getAggregateCost: () => 1.2345 });
    const result = await runCommand('/cost', ctx);
    expect(result.output.some((l) => l.includes('Aggregate: $1.2345'))).toBe(true);
  });

  it('/status shows session info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/status', ctx);
    expect(result.output.some((l) => l.includes('Session: test-session-abc'))).toBe(true);
    expect(result.output.some((l) => l.includes('Mode: code'))).toBe(true);
    expect(result.output.some((l) => l.includes('History: 3'))).toBe(true);
  });

  it('/status shows loop state when available', async () => {
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
    const result = await runCommand('/status', ctx);
    expect(result.output.some((l) => l.includes('Loop'))).toBe(true);
    expect(result.output.some((l) => l.includes('3/5'))).toBe(true);
  });

  it('/history shows command history', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/history', ctx);
    expect(result.output).toEqual(['  1. hello', '  2. /help', '  3. world']);
  });

  it('/history with empty history', async () => {
    const ctx = createMockContext({ getHistory: () => [] });
    const result = await runCommand('/history', ctx);
    expect(result.output).toEqual(['No history yet.']);
  });

  it('/tasks shows no tasks when no orchestrator', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/tasks', ctx);
    expect(result.output[0]).toContain('No tasks run yet');
  });

  it('/tasks shows task counts when orchestrator is active', async () => {
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
    const result = await runCommand('/tasks', ctx);
    expect(result.output.some((l) => l.includes('Agents spawned: 2'))).toBe(true);
    expect(result.output.some((l) => l.includes('Drafts proposed: 1'))).toBe(true);
    expect(result.output.some((l) => l.includes('Verifications: 1'))).toBe(true);
  });

  it('/todos is alias of /tasks', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/todos', ctx);
    expect(result.output[0]).toContain('No tasks run yet');
  });

  it('/compact shows nothing when history empty', async () => {
    const ctx = createMockContext({ getHistory: () => [] });
    const result = await runCommand('/compact', ctx);
    expect(result.output[0]).toContain('Nothing to compact');
  });

  it('/compact shows error when memory unavailable', async () => {
    const ctx = createMockContext({ getHistory: () => ['task1'] });
    const result = await runCommand('/compact', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/compact succeeds when memory is available', async () => {
    const ctx = createMockContext({
      getHistory: () => ['task1'],
      getMemorySize: () => 5,
    });
    const result = await runCommand('/compact', ctx);
    expect(result.output.some((l) => l.includes('Compacted'))).toBe(true);
  });

  it('/loop shows usage without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/loop', ctx);
    expect(result.output[0]).toContain('Usage');
  });

  it('/loop with valid args returns output', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/loop 3 do something', ctx);
    expect(result.output.some((l) => l.includes('running'))).toBe(true);
  });

  it('/goal shows usage without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/goal', ctx);
    expect(result.output[0]).toContain('Usage');
  });

  it('/goal with args returns output', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/goal all tests pass', ctx);
    expect(result.output.some((l) => l.includes('running until achieved'))).toBe(true);
  });

  it('/model shows unavailable when no providers', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/model', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/theme shows available themes without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/theme', ctx);
    expect(result.output.some((l) => l.includes('Available themes'))).toBe(true);
  });

  it('/theme with valid theme returns output', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/theme dark', ctx);
    expect(result.output[0]).toContain('Theme set to');
  });

  it('/theme with invalid theme shows error', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/theme rainbow', ctx);
    expect(result.output[0]).toContain('Unknown theme');
  });

  it('/output-style shows available styles without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/output-style', ctx);
    expect(result.output.some((l) => l.includes('Available output styles'))).toBe(true);
  });

  it('/permissions shows permission info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/permissions', ctx);
    expect(result.output.some((l) => l.includes('Permission mode'))).toBe(true);
  });

  it('/sandbox shows sandbox info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/sandbox', ctx);
    expect(result.output.some((l) => l.includes('Sandbox status'))).toBe(true);
  });

  it('/login shows login info without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/login', ctx);
    expect(result.output.some((l) => l.includes('Not logged in'))).toBe(true);
  });

  it('/login with invalid email shows error', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/login notanemail', ctx);
    expect(result.output[0]).toContain('valid email');
  });

  it('/login with valid email authenticates', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/login user@example.com', ctx);
    expect(result.output.some((l) => l.includes('Authenticated'))).toBe(true);
  });

  it('/logout returns output', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/logout', ctx);
    expect(result.output.some((l) => l.includes('Logged out'))).toBe(true);
  });

  it('/memory shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/memory', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/memory shows entries when available', async () => {
    const ctx = createMockContext({
      getMemorySize: () => 3,
      getMemoryEntries: () => [
        { content: 'memory 1', metadata: { topic: 'code' } },
        { content: 'memory 2', metadata: { topic: 'code' } },
        { content: 'memory 3', metadata: { topic: 'plan' } },
      ],
    });
    const result = await runCommand('/memory', ctx);
    expect(result.output.some((l) => l.includes('Memory: 3 entries'))).toBe(true);
    expect(result.output.some((l) => l.includes('code: 2'))).toBe(true);
    expect(result.output.some((l) => l.includes('plan: 1'))).toBe(true);
  });

  it('/mcp shows config info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/mcp', ctx);
    expect(result.output.some((l) => l.includes('No MCP servers'))).toBe(true);
  });

  it('/hooks shows config info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/hooks', ctx);
    expect(result.output.some((l) => l.includes('No hooks registered'))).toBe(true);
  });

  it('/ide shows connection info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/ide', ctx);
    expect(result.output.some((l) => l.includes('IDE connection'))).toBe(true);
  });

  it('/doctor shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/doctor', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/bug shows diagnostics', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/bug', ctx);
    expect(result.output.some((l) => l.includes('Bug report'))).toBe(true);
  });

  it('/feedback shows feedback info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/feedback', ctx);
    expect(result.output.some((l) => l.includes('Feedback'))).toBe(true);
  });

  it('/usage shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/usage', ctx);
    expect(result.output[0]).toContain('No token usage');
  });

  it('/usage shows token usage when available', async () => {
    const ctx = createMockContext({
      getTokenUsage: () => [
        { role: 'writer', spend: 0.5 },
        { role: 'reviewer', spend: 0.3 },
      ],
    });
    const result = await runCommand('/usage', ctx);
    expect(result.output.some((l) => l.includes('writer'))).toBe(true);
    expect(result.output.some((l) => l.includes('reviewer'))).toBe(true);
    expect(result.output.some((l) => l.includes('$0.8000'))).toBe(true);
  });

  it('/release-notes shows output', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/release-notes', ctx);
    expect(result.output.some((l) => l.includes('release notes'))).toBe(true);
  });

  it('/pr-comments shows auth info', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/pr-comments', ctx);
    expect(result.output.some((l) => l.includes('Not authenticated'))).toBe(true);
  });

  it('/privacy-settings shows settings', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/privacy-settings', ctx);
    expect(result.output.some((l) => l.includes('Privacy settings'))).toBe(true);
  });

  it('/migrate-installer shows status', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/migrate-installer', ctx);
    expect(result.output.some((l) => l.includes('No migration needed'))).toBe(true);
  });

  it('/teleport shows usage without args', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/teleport', ctx);
    expect(result.output.some((l) => l.includes('Teleport'))).toBe(true);
  });

  it('/config shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/config', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/vim toggles vim mode', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/vim', ctx);
    expect(result.output.some((l) => l.includes('Vim mode'))).toBe(true);
  });

  it('/clear returns clearMessages flag', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/clear', ctx);
    expect(result.clearMessages).toBe(true);
    expect(result.output).toEqual(['Chat cleared.']);
  });

  it('/exit returns exit flag', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/exit', ctx);
    expect(result.exit).toBe(true);
    expect(result.output).toEqual(['Goodbye.']);
  });

  it('/quit returns exit flag', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/quit', ctx);
    expect(result.exit).toBe(true);
  });

  it('/sessions returns viewHint', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/sessions', ctx);
    expect(result.viewHint).toBe('sessions');
  });

  it('/diff returns viewHint', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/diff', ctx);
    expect(result.viewHint).toBe('diff');
  });

  it('/agents shows message when no orchestrator', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/agents', ctx);
    expect(result.viewHint).toBe('agents');
  });

  it('/agents shows spawned agents when available', async () => {
    const ctx = createMockContext({
      getEventStream: () => ({
        getAll: () => [
          { type: 'agent_spawned', agentId: 'a1', role: 'writer', provider: 'openai', model: 'gpt-4' },
        ],
      }),
    });
    const result = await runCommand('/agents', ctx);
    expect(result.output.some((l) => l.includes('Agents (1 total)'))).toBe(true);
  });

  it('/events returns viewHint', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/events', ctx);
    expect(result.viewHint).toBe('events');
  });

  it('/resume shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/resume', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('/rewind shows unavailable when not provided', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/rewind', ctx);
    expect(result.output[0]).toContain('not available');
  });

  it('unknown command returns error', async () => {
    const ctx = createMockContext();
    const result = await runCommand('/nonexistent', ctx);
    expect(result.output[0]).toContain('Unknown command');
  });

  // /trust runs in-place in the TUI (it's launched from the CLI, so bouncing
  // the user out to a terminal just to enable hooks isn't workable).
  // CHIMERA_TRUST_STORE redirects the store so we never touch the real
  // ~/.chimera/trusted-workspaces.
  describe('/trust', () => {
    let tmpDir: string;
    let prevStore: string | undefined;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tui-trust-'));
      prevStore = process.env.CHIMERA_TRUST_STORE;
      process.env.CHIMERA_TRUST_STORE = path.join(tmpDir, 'trusted-workspaces');
    });

    afterEach(async () => {
      if (prevStore === undefined) delete process.env.CHIMERA_TRUST_STORE;
      else process.env.CHIMERA_TRUST_STORE = prevStore;
      await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    it('reports an empty store', async () => {
      const result = await runCommand('/trust --list', createMockContext());
      expect(result.output[0]).toContain('No trusted workspaces');
    });

    it('shows usage when given no path', async () => {
      const result = await runCommand('/trust', createMockContext());
      expect(result.output.join('\n')).toContain('/trust <path>');
    });

    it('trusts a workspace, lists it, then untrusts it', async () => {
      const ws = path.join(tmpDir, 'ws');
      await fs.mkdir(ws, { recursive: true });
      const ctx = createMockContext();

      const trusted = await runCommand(`/trust ${ws}`, ctx);
      expect(trusted.output[0]).toContain(path.resolve(ws));

      const listed = await runCommand('/trust --list', ctx);
      expect(listed.output.join('\n')).toContain(path.resolve(ws));

      const removed = await runCommand(`/trust --untrust ${ws}`, ctx);
      expect(removed.output[0]).toContain('Untrusted');

      const after = await runCommand('/trust --list', ctx);
      expect(after.output[0]).toContain('No trusted workspaces');
    });
  });
});

describe('autocompleteCommand', async () => {
  it('returns all commands for "/" alone', async () => {
    const matches = autocompleteCommand('/');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((c) => c.startsWith('/'))).toBe(true);
  });

  it('filters by prefix', async () => {
    const matches = autocompleteCommand('/he');
    expect(matches).toEqual(['/help']);
  });

  it('returns multiple matches for ambiguous prefix', async () => {
    const matches = autocompleteCommand('/c');
    expect(matches.includes('/clear')).toBe(true);
    expect(matches.includes('/cost')).toBe(true);
  });

  it('returns empty for non-slash input', async () => {
    expect(autocompleteCommand('hello')).toEqual([]);
  });

  it('returns empty for no match', async () => {
    expect(autocompleteCommand('/zzz')).toEqual([]);
  });

  it('includes new commands in autocomplete', async () => {
    const matches = autocompleteCommand('/m');
    expect(matches.includes('/mode')).toBe(true);
    expect(matches.includes('/model')).toBe(true);
    expect(matches.includes('/memory')).toBe(true);
  });
});
