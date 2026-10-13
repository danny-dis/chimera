import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SideQueryChannel } from '../side-query.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

it('releases the mutex after lockfile acquisition throws', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-lock-error-')); roots.push(root);
  const provider = { complete: vi.fn().mockResolvedValue({ content: '{"ok":true}', usage: { inputTokens: 1, outputTokens: 1 } }) };
  const channel = new SideQueryChannel({ provider, lockfilePath: join(root, 'query.lock'), timeoutMs: 100 });
  const query = { prompt: 'probe', schema: z.object({ ok: z.boolean() }) };
  vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(Object.assign(new Error('lock unavailable'), { code: 'EACCES' }));
  await expect(channel.query(query)).rejects.toThrow('lock unavailable');
  expect(await channel.query(query)).toEqual({ ok: true, data: { ok: true } });
}, 1500);
