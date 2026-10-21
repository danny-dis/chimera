import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const state = vi.hoisted(() => ({ child: undefined as any }));
vi.mock('child_process', () => ({ spawn: () => state.child }));
import { startLspConnection } from '../connection.js';
import { ChimeraLspService } from '../lsp-service.js';

function child() {
  return Object.assign(new EventEmitter(), {
    pid: 123, exitCode: null as number | null, signalCode: null,
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => false),
  });
}
function transport() {
  return { listen: vi.fn(), dispose: vi.fn(), sendRequest: vi.fn(async () => ({ capabilities: {} })),
    sendNotification: vi.fn(), onNotification: () => ({ dispose() {} }) };
}
afterEach(() => { vi.useRealTimers(); });

it('shares pending startup while cleanup has changed status to stopped', async () => {
  vi.useFakeTimers(); state.child = child(); const connection = transport();
  const factory = vi.fn(async () => connection);
  const service = new ChimeraLspService(process.cwd(), {
    config: { servers: { ts: { command: 'fake', filePatterns: ['**/*.ts'] } } }, connectionFactory: factory,
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  (service as any).servers.get('ts').status = 'stopped';
  (service as any).startInFlight.set('ts', pending);
  const starting = service.start();
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(factory).not.toHaveBeenCalled();
  } finally {
    release(); await starting; state.child.exitCode = 0; await service.dispose();
  }
});

it('disposes acquired transport when listen fails and exposes failed child cleanup', async () => {
  vi.useFakeTimers(); state.child = child(); const connection = transport();
  connection.listen.mockImplementation(() => { throw new Error('listen failed'); });
  const attempt = startLspConnection({ workspaceRoot: process.cwd(), config: { command: 'fake' }, connectionFactory: async () => connection });
  const rejected = expect(attempt).rejects.toMatchObject({ child: state.child });
  await vi.advanceTimersByTimeAsync(1100); await rejected;
  expect(connection.dispose).toHaveBeenCalledOnce();
});

it('retains exact child ownership after failed shutdown so disposal can retry', async () => {
  vi.useFakeTimers(); state.child = child(); const connection = transport();
  const service = new ChimeraLspService(process.cwd(), {
    config: { servers: { ts: { command: 'fake', filePatterns: ['**/*.ts'] } } },
    connectionFactory: async () => connection,
  });
  try {
    await service.start();
    const attempt = service.dispose(); const rejected = expect(attempt).rejects.toThrow(/did not exit/);
    await vi.advanceTimersByTimeAsync(1100); await rejected;
    expect((service as any).servers.get('ts').child).toBe(state.child);
  } finally {
    state.child.exitCode = 0; await service.dispose();
  }
});
