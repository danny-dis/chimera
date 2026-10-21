import { afterEach, expect, it, vi } from 'vitest';
import { EventStream } from '@chimera/core';
import { CliRouter } from '../cli-router.js';
const ui = vi.hoisted(() => ({ props: undefined as any, finish: undefined as undefined | (() => void), cleanup: vi.fn() }));
vi.mock('@chimera/tui', () => ({ runTUI: (props: any) => {
  ui.props = props;
  const exited = new Promise<void>(resolve => { ui.finish = resolve; });
  return { update: (update: any) => { ui.props = { ...ui.props, ...update }; }, cleanup: ui.cleanup, waitUntilExit: () => exited };
} }));
vi.mock('../config-loader.js', async original => ({
  ...await original<typeof import('../config-loader.js')>(),
  configExists: () => true, loadConfig: () => null, getDefaultPreset: () => 'solo',
}));
const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
afterEach(() => {
  ui.finish?.();
  if (tty) Object.defineProperty(process.stdin, 'isTTY', tty); else delete (process.stdin as any).isTTY;
  vi.restoreAllMocks();
  ui.props = undefined; ui.finish = undefined; ui.cleanup.mockClear();
});
it('serializes host runs, isolates cancellation, restores checkpoints and reports tracker spend', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  const router = new CliRouter() as any;
  const eventStream = new EventStream();
  const checkpoint = { sessionId: 'saved', mode: 'ask', task: 'previous task', messages: [{ role: 'user', content: 'previous task' }] };
  const provider = { getModel: () => ({ provider: 'configured', name: 'fixture', id: 'fixture', contextWindow: 4096 }), complete: vi.fn() };
  vi.spyOn(router, 'getRoleMappedProviders').mockResolvedValue({ writer: provider, reviewer: provider, fallback: [provider] });
  router.sessionStore = { generateSessionId: () => 'new', list: vi.fn(async () => []), load: vi.fn(async () => checkpoint),
    save: vi.fn(async () => {}), delete: vi.fn(async () => true) };
  router.memory = { getAll: () => [], size: () => 0 };
  const tracker = { getTotalCost: () => 3, getSpendByProvider: () => ({ writer: 3 }), getSpend: () => 3 };
  const signals: AbortSignal[] = [];
  let release!: () => void;
  const execute = vi.fn(async (options: any) => {
    signals.push(options.signal);
    if (signals.length === 1) await new Promise<void>(resolve => { release = resolve; options.signal.addEventListener('abort', resolve, { once: true }); });
    return { status: options.signal.aborted ? 'needs_user' : 'done', output: 'fixture response', cost: 3, agentCount: 1 };
  });
  const orchestrator = { execute, getEventStream: () => eventStream, getCostTracker: () => tracker,
    exportState: () => checkpoint, restoreState: vi.fn(async () => {}), dispose: vi.fn() };
  const toolExecutor = { setPermissionEngine: vi.fn() };
  vi.spyOn(router, 'buildRunContext').mockResolvedValue({ orchestrator, toolExecutor });
  const launched = router.startTui(undefined, 'code');
  try {
    await vi.waitFor(() => expect(ui.props).toBeDefined());
    expect(ui.props.costData.currentCost).toBe(3);
    expect(ui.props.commandContext.getAggregateCost()).toBe(3);
    const first = ui.props.onSendMessage('first task');
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(ui.props.isRunning).toBe(true);
    await ui.props.onSendMessage('must not overlap');
    expect(execute).toHaveBeenCalledOnce();
    ui.props.onCancel();
    await first;
    expect(signals[0].aborted).toBe(true);
    expect(ui.props.isRunning, ui.props.messages.map((message: any) => message.content).join('\n')).toBe(false);
    ui.props.onModeChange('review');
    await ui.props.onSendMessage('next task');
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'review' }));
    expect(signals[1]).not.toBe(signals[0]);
    await ui.props.onSessionSelect('saved');
    expect(orchestrator.restoreState).toHaveBeenCalledWith(checkpoint);
    expect(ui.props.sessionId).toBe('saved');
    expect(ui.props.mode).toBe('ask');
    expect(ui.props.messages.some((message: any) => message.content === 'previous task')).toBe(true);
  } finally {
    release?.(); ui.finish?.(); await launched;
  }
  expect(orchestrator.dispose).toHaveBeenCalledOnce();
  expect(ui.cleanup).toHaveBeenCalledOnce();
}, 30_000);
