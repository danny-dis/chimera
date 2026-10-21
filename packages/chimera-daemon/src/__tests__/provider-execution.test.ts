import { describe, expect, it, vi, afterEach } from 'vitest';
const spies = vi.hoisted(() => ({ dispose: vi.fn(), getCostTracker: vi.fn(() => ({ getTotalCost: (): number => 0, getSpendByProvider: (): Record<string, number> => ({}) })), execute: vi.fn().mockResolvedValue({ status: 'needs_user', output: 'check failed', cost: 2, agentCount: 3, events: [] }), complete: vi.fn(), create: vi.fn() }));
vi.mock('@chimera/core', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  adaptProvider: (provider: unknown) => provider,
  createRuntimeMemory: vi.fn().mockResolvedValue({}),
  SessionOrchestrator: class {
    execute = spies.execute;
    dispose = spies.dispose;
    getCostTracker = spies.getCostTracker;
  },
}));
vi.mock('@chimera/providers', () => ({ ProviderFactory: { create: spies.create } }));
vi.mock('../config-loader.js', () => ({
  loadConfig: () => ({ defaults: {}, providers: [{ name: 'writer', constraints: { cost_cap_per_task: 4 } }] }),
  getDefaultMode: () => 'code',
  resolveProviders: () => [{ name: 'writer', provider: 'openai-compatible', role: 'writer', model: 'test' }, { name: 'reviewer', provider: 'openai-compatible', role: 'reviewer', model: 'test' }],
  getProvidersByRole: () => ({ writer: { name: 'writer' }, reviewer: { name: 'reviewer' } }),
}));
vi.mock('../bootstrap.js', () => ({ bootstrap: () => ({ workflowRegistry: {} }) }));
import { ChimeraDaemon } from '../server.js';

describe('daemon provider execution boundary', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it.each(['rpc', 'dispose'])('forwards cancellation through %s', async (action) => {
    spies.create.mockReturnValue({ complete: spies.complete, getModel: () => ({ provider: 'openai-compatible' }) });
    let signal!: AbortSignal;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    spies.execute.mockImplementationOnce(params => {
      signal = params.signal;
      started();
      return new Promise(resolve => signal.addEventListener('abort', () => resolve({ status: 'needs_user', output: 'cancelled', cost: 0, agentCount: 1, events: [] }), { once: true }));
    });
    const daemon = new ChimeraDaemon() as any;
    const stop = vi.spyOn(daemon.scheduler, 'stop');
    const work = daemon.executeTask({ task: 'inspect', mode: 'ask', workspaceRoot: process.cwd() });
    try {
      await ready;
      if (action === 'rpc') await daemon.handleRequest({ jsonrpc: '2.0', id: 1, method: 'cancel_task', params: { workerId: 'worker-1' } });
      else daemon.dispose();
      expect(signal.aborted).toBe(true);
      expect((await work).status).toBe('needs_user');
      expect(daemon.workers.size).toBe(0);
      if (action === 'dispose') expect(stop).toHaveBeenCalled();
    } finally { daemon.dispose(); }
  });

  it.each(['rpc', 'dispose'])('cancels an initializing worker through %s before memory is ready', async (action) => {
    spies.create.mockReturnValue({ complete: spies.complete, getModel: () => ({ provider: 'openai-compatible' }) });
    const core = await import('@chimera/core');
    const rpc = await import('../json-rpc.js');
    const messages = vi.spyOn(rpc, 'writeMessage').mockImplementation(() => {});
    let release!: (value: any) => void;
    vi.mocked(core.createRuntimeMemory).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const daemon = new ChimeraDaemon();
    const running = (daemon as any).executeTask({ task: 'inspect', mode: 'review', workspaceRoot: process.cwd() });
    const rejected = expect(running).rejects.toThrow(action === 'rpc' ? /cancelled/i : /disposed/i);
    try {
      await Promise.resolve();
      const pending = [...(daemon as any).workers.keys()];
      expect(pending).toHaveLength(1);
      await daemon.handleRequest({ jsonrpc: '2.0', id: 4, method: 'get_state' });
      expect(messages).toHaveBeenLastCalledWith(expect.objectContaining({
        result: expect.objectContaining({ status: 'running', workers: [{ id: pending[0], status: 'initializing' }], cost: {} }),
      }));
      if (action === 'rpc') {
        await daemon.handleRequest({ jsonrpc: '2.0', id: 5, method: 'cancel_task', params: { workerId: pending[0] } });
        expect(messages).toHaveBeenLastCalledWith(expect.objectContaining({ result: { cancelled: true } }));
      } else daemon.dispose();
      await rejected;
      expect(spies.execute).not.toHaveBeenCalled();
      expect((daemon as any).workers.size).toBe(0);
      release({});
      await Promise.resolve();
      expect(spies.execute).not.toHaveBeenCalled();
    } finally { release?.({}); daemon.dispose(); messages.mockRestore(); }
  }, 2000);
  it('does not start a worker if disposed while memory initializes', async () => {
    spies.create.mockReturnValue({ complete: spies.complete, getModel: () => ({ provider: 'openai-compatible' }) });
    const { createRuntimeMemory } = await import('@chimera/core');
    let release!: () => void;
    vi.mocked(createRuntimeMemory).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({} as any); }));
    const daemon = new ChimeraDaemon() as any;
    const work = daemon.executeTask({ task: 'inspect', mode: 'ask', workspaceRoot: process.cwd() });
    const rejected = expect(work).rejects.toThrow(/disposed/i);
    try {
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      daemon.dispose(); release(); await rejected;
      expect(spies.execute).not.toHaveBeenCalled();
      expect(daemon.workers.size).toBe(0);
    } finally { release?.(); daemon.dispose(); }
  });

  it.each(['success', 'rejection'])('retains actual spend once after execution %s and repeated disposal', async (outcome) => {
    spies.create.mockReturnValue({ complete: spies.complete, getModel: () => ({ provider: 'openai-compatible' }) });
    spies.getCostTracker.mockReturnValueOnce({ getTotalCost: () => 2, getSpendByProvider: () => ({ provider: 2 }) });
    if (outcome === 'rejection') spies.execute.mockRejectedValueOnce(new Error('execution failed'));
    const daemon = new ChimeraDaemon() as any;
    try {
      const running = daemon.executeTask({ task: 'inspect', mode: 'review', workspaceRoot: process.cwd() });
      if (outcome === 'rejection') await expect(running).rejects.toThrow('execution failed');
      else await running;
      expect(daemon.workers.size).toBe(0);
      expect(daemon.getCost()).toMatchObject({ total: 2, byProvider: { provider: 2 } });
      daemon.dispose(); daemon.dispose();
      expect(spies.dispose).toHaveBeenCalledTimes(1);
      expect(daemon.getCost()).toMatchObject({ total: 2, byProvider: { provider: 2 } });
    } finally { daemon.dispose(); }
  });

  it('uses configured roles/mode/checks and returns authoritative results', async () => {
    spies.create.mockReturnValue({ complete: spies.complete, getModel: () => ({ provider: 'openai-compatible' }) });
    const daemon = new ChimeraDaemon();
    try {
      const result = await (daemon as any).executeTask({ task: 'inspect', mode: 'review', workspaceRoot: process.cwd(), verificationCommands: ['caller check'] });
      expect(spies.create).toHaveBeenCalled();
      expect(spies.execute).toHaveBeenCalledWith(expect.objectContaining({ mode: 'review', costCap: 4, verificationCommands: ['caller check'], providers: expect.objectContaining({ writer: expect.anything(), reviewer: expect.anything() }) }));
      expect(result).toEqual({ status: 'needs_user', output: 'check failed', cost: 2, agentCount: 3, events: [] });
    } finally { daemon.dispose(); }
  });
  it('refuses an invalid mode before constructing a provider', async () => {
    const daemon = new ChimeraDaemon();
    try {
      await expect((daemon as any).executeTask({ task: 'inspect', mode: 'bogus', workspaceRoot: process.cwd() })).rejects.toThrow(/mode/i);
      expect(spies.create).not.toHaveBeenCalled();
    } finally { daemon.dispose(); }
  });
  it('refuses mock providers rather than pretending to run a task', async () => {
    spies.create.mockReturnValue({ getModel: () => ({ provider: 'mock' }) });
    const daemon = new ChimeraDaemon();
    try {
      await expect((daemon as any).executeTask({ task: 'inspect', mode: 'ask', workspaceRoot: process.cwd() })).rejects.toThrow(/provider/i);
    } finally { daemon.dispose(); }
  });
});
