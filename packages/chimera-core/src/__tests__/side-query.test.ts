import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import {
  SideQueryChannel,
  sideQuery,
  setSideQueryChannel,
  SIDEQUERY_NO_LEAK_MARKER,
  fingerprintPayload,
  type SideQueryProvider,
} from '../side-query.js';

const SimpleSchema = z.object({
  category: z.enum(['read', 'write', 'delete']),
  confidence: z.number().min(0).max(1),
});

const NestedSchema = z.object({
  files: z.array(z.string()),
  metadata: z.object({ count: z.number(), ok: z.boolean() }),
});

function makeProvider(content: unknown | ((callIndex: number) => unknown)): {
  provider: SideQueryProvider;
  calls: Array<{ messages: Array<{ role: string; content: string }>; opts: any }>;
} {
  const calls: Array<{ messages: Array<{ role: string; content: string }>; opts: any }> = [];
  let callIndex = 0;
  const provider: SideQueryProvider = {
    async complete(messages, opts) {
      calls.push({ messages, opts });
      const data = typeof content === 'function' ? content(callIndex) : content;
      callIndex++;
      return {
        content: typeof data === 'string' ? data : JSON.stringify(data),
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
  };
  return { provider, calls };
}

describe('SideQueryChannel', () => {
  let tmpDir: string;
  let lockfilePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidequery-test-'));
    lockfilePath = path.join(tmpDir, 'sidequery.lock');
  });

  afterEach(async () => {
    setSideQueryChannel(null);
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  describe('schema validation', () => {
    it('returns ok:true and parsed data on a valid response', async () => {
      const { provider } = makeProvider({ category: 'read', confidence: 0.9 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({
        prompt: 'classify this',
        schema: SimpleSchema,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.category).toBe('read');
        expect(result.data.confidence).toBe(0.9);
      }
    });

    it('returns ok:false with an error message on a malformed response', async () => {
      const { provider } = makeProvider('not json at all');
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({
        prompt: 'classify this',
        schema: SimpleSchema,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/not valid JSON/i);
      }
    });

    it('returns ok:false when JSON parses but does not match schema', async () => {
      const { provider } = makeProvider({ category: 'unknown', confidence: 1.5 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({
        prompt: 'classify this',
        schema: SimpleSchema,
      });
      expect(result.ok).toBe(false);
    });

    it('handles nested object schemas', async () => {
      const { provider } = makeProvider({
        files: ['a.ts', 'b.ts'],
        metadata: { count: 2, ok: true },
      });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({
        prompt: 'list files',
        schema: NestedSchema,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.files).toEqual(['a.ts', 'b.ts']);
        expect(result.data.metadata.count).toBe(2);
      }
    });

    it('extracts JSON when the response contains surrounding prose', async () => {
      const { provider } = makeProvider(
        'Sure, here is the result:\n```json\n{"category":"write","confidence":0.7}\n```\nDone.',
      );
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({
        prompt: 'classify',
        schema: SimpleSchema,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.category).toBe('write');
      }
    });
  });

  describe('repair retry', () => {
    it('retries once on validation failure and succeeds if the retry returns valid JSON', async () => {
      const { provider, calls } = makeProvider((i) => {
        if (i === 0) return { category: 'BOGUS', confidence: 2 };
        return { category: 'read', confidence: 0.5 };
      });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({ prompt: 'classify', schema: SimpleSchema });
      expect(calls.length).toBe(2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.category).toBe('read');
      }
    });

    it('does not retry more than once', async () => {
      const { provider, calls } = makeProvider('still not json');
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({ prompt: 'classify', schema: SimpleSchema });
      expect(calls.length).toBe(2);
      expect(result.ok).toBe(false);
    });

    it('includes the original prompt and a validation hint in the repair prompt', async () => {
      const { provider, calls } = makeProvider((i) => {
        if (i === 0) return { category: 'BOGUS', confidence: 0.5 };
        return { category: 'write', confidence: 0.5 };
      });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      await channel.query({ prompt: 'classify-this-distinct-text', schema: SimpleSchema });
      expect(calls[1].messages[1].content).toContain('classify-this-distinct-text');
      expect(calls[1].messages[1].content).toContain('validation');
    });
  });

  describe('lockfile concurrency', () => {
    it('creates a lockfile before calling the provider and removes it on success', async () => {
      const { provider } = makeProvider({ category: 'read', confidence: 0.9 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const existsDuringCall = vi.fn();
      const providerWithProbe: SideQueryProvider = {
        async complete(messages, opts) {
          try {
            await fs.access(lockfilePath);
            existsDuringCall(true);
          } catch {
            existsDuringCall(false);
          }
          return provider.complete(messages, opts);
        },
      };
      const channel2 = new SideQueryChannel({ provider: providerWithProbe, lockfilePath });
      await channel2.query({ prompt: 'x', schema: SimpleSchema });
      expect(existsDuringCall).toHaveBeenCalledWith(true);
      // Lockfile removed after success
      await expect(fs.access(lockfilePath)).rejects.toThrow();
    });

    it('rejects a concurrent call when the lockfile is held by a different PID', async () => {
      // Write a lockfile with a different PID and a fresh mtime.
      await fs.writeFile(lockfilePath, '999999', 'utf8');
      const { provider } = makeProvider({ category: 'read', confidence: 0.9 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({ prompt: 'x', schema: SimpleSchema });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/lock held/i);
      }
    });

    it('reclaims a stale lockfile (mtime older than LOCK_STALE_MS)', async () => {
      const { provider } = makeProvider({ category: 'read', confidence: 0.9 });
      // Write a lockfile claiming a different PID but old mtime.
      const oldTime = new Date(Date.now() - 10 * 60 * 1000);
      await fs.writeFile(lockfilePath, '999999', 'utf8');
      await fs.utimes(lockfilePath, oldTime, oldTime);
      const channel = new SideQueryChannel({ provider, lockfilePath });
      const result = await channel.query({ prompt: 'x', schema: SimpleSchema });
      expect(result.ok).toBe(true);
    });
  });

  describe('no-leak marker', () => {
    it('prefixes the system prompt with the no-leak marker', async () => {
      const { provider, calls } = makeProvider({ category: 'read', confidence: 0.9 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      await channel.query({ prompt: 'classify', schema: SimpleSchema });
      expect(calls[0].messages[0].role).toBe('system');
      expect(calls[0].messages[0].content).toContain(SIDEQUERY_NO_LEAK_MARKER);
    });

    it('respects a caller-provided systemPrompt override', async () => {
      const { provider, calls } = makeProvider({ category: 'read', confidence: 0.9 });
      const channel = new SideQueryChannel({ provider, lockfilePath });
      await channel.query({
        prompt: 'classify',
        schema: SimpleSchema,
        systemPrompt: 'CUSTOM SYSTEM PROMPT',
      });
      expect(calls[0].messages[0].content).toBe('CUSTOM SYSTEM PROMPT');
    });
  });

  describe('function-form sideQuery()', () => {
    it('uses opts.provider when no default channel is set', async () => {
      const { provider } = makeProvider({ category: 'write', confidence: 0.3 });
      setSideQueryChannel(null);
      const result = await sideQuery({ prompt: 'x', schema: SimpleSchema, provider });
      expect(result.ok).toBe(true);
    });

    it('returns a helpful error when no provider is configured and none is passed', async () => {
      setSideQueryChannel(null);
      const result = await sideQuery({ prompt: 'x', schema: SimpleSchema });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/provider/i);
      }
    });

    it('uses the default channel when configured', async () => {
      const { provider } = makeProvider({ category: 'delete', confidence: 0.1 });
      setSideQueryChannel(new SideQueryChannel({ provider, lockfilePath }));
      const result = await sideQuery({ prompt: 'x', schema: SimpleSchema });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.category).toBe('delete');
      }
    });
  });

  describe('fingerprintPayload', () => {
    it('produces a stable 16-char hex hash', () => {
      const a = fingerprintPayload('hello world');
      const b = fingerprintPayload('hello world');
      const c = fingerprintPayload('hello WORLD');
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
