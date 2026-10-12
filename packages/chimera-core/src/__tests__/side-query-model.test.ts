import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SideQueryChannel } from '../side-query.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

it('rejects a model override rather than silently querying the default provider', async () => {
  const provider = { complete: vi.fn() };
  const channel = new SideQueryChannel({ provider });
  expect(await channel.query({ model: 'requested-cheap-model', prompt: 'probe', schema: z.object({ ok: z.boolean() }) }))
    .toMatchObject({ ok: false, error: expect.stringMatching(/model.*resolver/i) });
  expect(provider.complete).not.toHaveBeenCalled();
});

it('uses the injected resolver for configured and per-query models', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'chimera-model-')); roots.push(root);
  const provider = { complete: vi.fn() };
  const selected = { complete: vi.fn().mockResolvedValue({ content: '{"ok":true}', usage: { inputTokens: 1, outputTokens: 1 } }) };
  const resolveProvider = vi.fn(() => selected);
  const channel = new SideQueryChannel({ provider, model: 'configured-cheap', resolveProvider, lockfilePath: join(root, 'query.lock') });
  const query = { prompt: 'probe', schema: z.object({ ok: z.boolean() }) };
  expect((await channel.query(query)).ok).toBe(true);
  expect((await channel.query({ ...query, model: 'requested-cheap' })).ok).toBe(true);
  expect(resolveProvider.mock.calls).toEqual([['configured-cheap'], ['requested-cheap']]);
  expect(selected.complete).toHaveBeenCalledTimes(2);
  expect(provider.complete).not.toHaveBeenCalled();
});
