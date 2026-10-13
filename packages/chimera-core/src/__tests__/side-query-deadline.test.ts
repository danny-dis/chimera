import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SideQueryChannel } from '../side-query.js';

const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('side-query deadline', () => {
  it('aborts the provider and releases its lock even if it ignores cancellation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chimera-side-query-'));
    roots.push(root);
    let received: AbortSignal | undefined;
    let called!: () => void;
    const started = new Promise<void>((resolve) => { called = resolve; });
    const provider = { complete: vi.fn((_messages, options) => {
      received = options?.signal;
      called();
      return new Promise<never>(() => {});
    }) };
    const channel = new SideQueryChannel({ provider, timeoutMs: 1000, lockfilePath: join(root, 'query.lock') });
    vi.useFakeTimers();
    const query = channel.query({ prompt: 'probe', schema: z.object({ ok: z.boolean() }) });
    await started;
    await vi.advanceTimersByTimeAsync(1001);
    expect(await query).toMatchObject({ ok: false });
    expect(received?.aborted).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    provider.complete.mockResolvedValueOnce({ content: '{"ok":true}', usage: { inputTokens: 1, outputTokens: 1 } } as never);
    expect(await channel.query({ prompt: 'next', schema: z.object({ ok: z.boolean() }) })).toEqual({ ok: true, data: { ok: true } });
  });
});
