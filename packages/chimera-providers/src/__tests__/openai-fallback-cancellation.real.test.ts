import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';

it.each(['response-format', 'empty-content'] as const)('cancels a pending %s fallback request', async phase => {
  let count = 0;
  let ready!: () => void;
  let closed!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer((req, res) => {
    count++;
    if (count === 1) {
      res.writeHead(phase === 'response-format' ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(phase === 'response-format' ? { error: { message: 'unsupported response format' } } : { choices: [{ message: { content: '' } }], usage: { prompt_tokens: 1, completion_tokens: 0 } }));
    } else {
      req.socket.once('close', closed);
      ready();
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${address.port}`, model: 'controlled-test', apiKey: 'local-test', options: { timeoutMs: 30000 } });
  const abort = new AbortController();
  const outcome = provider.complete([{ role: 'user', content: 'test' }], { signal: abort.signal, responseFormat: phase === 'response-format' ? 'json_object' : undefined }).then(() => 'fulfilled', () => 'rejected');
  try {
    expect(await Promise.race([started.then(() => true), delay(1000).then(() => false)])).toBe(true);
    abort.abort(new Error('caller stopped'));
    expect(await Promise.race([outcome, delay(600).then(() => 'pending')])).toBe('rejected');
    expect(await Promise.race([disconnected.then(() => true), delay(1000).then(() => false)])).toBe(true);
    expect(count).toBe(2);
  } finally {
    abort.abort();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await outcome;
  }
}, 10000);
