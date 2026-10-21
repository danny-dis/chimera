import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';

it.each(['headers', 'body', 'backoff'] as const)('aborts the actual HTTP %s operation without another request', async phase => {
  let count = 0;
  let ready!: () => void;
  let closed!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer((req, res) => {
    count++;
    req.socket.once('close', closed);
    if (phase === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"choices":'); }
    if (phase === 'backoff') { res.writeHead(503); res.end('{}'); }
    ready();
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${address.port}`, model: 'controlled-test', apiKey: 'test-only', options: { timeoutMs: 30000 } });
  const abort = new AbortController();
  const request = provider.complete([{ role: 'user', content: 'test' }], { signal: abort.signal } as any);
  const outcome = request.then(() => 'fulfilled', () => 'rejected');
  try {
    await started;
    abort.abort(new Error('caller stopped'));
    expect(await Promise.race([outcome, delay(600).then(() => 'pending')])).toBe('rejected');
    if (phase !== 'backoff') expect(await Promise.race([disconnected.then(() => true), delay(1000).then(() => false)])).toBe(true);
    expect(count).toBe(1);
  } finally {
    abort.abort();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await outcome;
  }
}, 10000);
