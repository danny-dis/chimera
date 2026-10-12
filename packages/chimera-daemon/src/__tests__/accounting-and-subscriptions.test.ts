import { afterEach, expect, it, vi } from 'vitest';
import { CostTracker } from '@chimera/core';
vi.mock('../json-rpc.js', async original => ({ ...await original<Record<string, unknown>>(), writeMessage: vi.fn() }));
import { writeMessage } from '../json-rpc.js';
import { ChimeraDaemon } from '../server.js';
const servers: ChimeraDaemon[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.dispose(); vi.clearAllMocks(); });
function setup() { const server = new ChimeraDaemon(); const stream = server.getEventStream(); servers.push(server); return { stream, server }; }
it('replaces repeated subscription IDs and cleans up the only listener', async () => {
  const { stream, server } = setup();
  await (server as any).streamEvents('same'); await (server as any).streamEvents('same');
  vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).toHaveBeenCalledTimes(1);
  server.dispose(); vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).not.toHaveBeenCalled();
});
it('refuses subscription resurrection through RPC after disposal', async () => {
  const { stream, server } = setup();
  server.dispose();
  await server.handleRequest({ jsonrpc: '2.0', id: 7, method: 'stream_events' });
  expect(writeMessage).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'Daemon disposed' }) }));
  vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).not.toHaveBeenCalled();
});
it('keeps numeric and string RPC subscription IDs distinct', async () => {
  const { stream, server } = setup();
  await (server as any).streamEvents(1); await (server as any).streamEvents('1');
  vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).toHaveBeenCalledTimes(2);
  await (server as any).streamEvents(1);
  vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).toHaveBeenCalledTimes(2);
  server.dispose(); vi.mocked(writeMessage).mockClear(); stream.append({ type: 'test' } as any);
  expect(writeMessage).not.toHaveBeenCalled();
});
it('sums every worker once regardless of historical spawn count', () => {
  const { stream, server } = setup();
  const first = new CostTracker(stream), second = new CostTracker(stream);
  first.recordSpend('provider', 2); second.recordSpend('provider', 3);
  for (let i = 0; i < 3; i++) stream.append({ type: 'agent_spawned', provider: 'provider' } as any);
  for (const [id, tracker] of [['first', first], ['second', second]] as const) {
    (server as any).workers.set(id, { controller: new AbortController(), orchestrator: { getCostTracker: () => tracker, dispose() {} } });
  }
  expect((server as any).getCost()).toMatchObject({ total: 5, byProvider: { provider: 5 } });
});
