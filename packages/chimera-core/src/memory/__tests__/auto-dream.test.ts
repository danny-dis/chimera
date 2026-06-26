import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoDreamService } from '../auto-dream.js';
import { LongTermMemory } from '../long-term-memory.js';
import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../../side-query.js', () => ({
  sideQuery: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      summaries: [
        { topic: 'test', summary: 'Consolidated fact', sourceIds: [], importance: 0.8 },
      ],
    },
  }),
}));

function tmpDir(): string {
  return path.join(os.tmpdir(), `chimera-dream-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('AutoDreamService', () => {
  let memory: LongTermMemory;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    memory = new LongTermMemory();
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('shouldDream returns false when sessions < minSessionGap', async () => {
    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 5,
      minTimeGapMs: 0,
    });

    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
  });

  it('shouldDream returns true after minSessionGap calls', async () => {
    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 3,
      minTimeGapMs: 0,
    });

    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(true);
  });

  it('shouldDream returns false when disabled', async () => {
    const service = new AutoDreamService(memory, { lockfileDir: dir, enabled: false });
    expect(await service.shouldDream()).toBe(false);
  });

  it('dream returns valid result shape', async () => {
    await memory.write({ content: 'fact a', topic: 't', importance: 0.9 });
    await memory.write({ content: 'fact b', topic: 't', importance: 0.8 });

    const service = new AutoDreamService(memory, { lockfileDir: dir });
    const result = await service.dream();

    expect(typeof result.consolidated).toBe('number');
    expect(typeof result.pruned).toBe('number');
    expect(result.consolidated).toBeGreaterThanOrEqual(0);
    expect(result.pruned).toBeGreaterThanOrEqual(0);
  });

  it('dream with no memories returns zeros', async () => {
    const service = new AutoDreamService(memory, { lockfileDir: dir });
    const result = await service.dream();

    expect(result.consolidated).toBe(0);
    expect(result.pruned).toBe(0);
  });

  it('state persists across service instances', async () => {
    const service1 = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 10,
      minTimeGapMs: 0,
    });

    await service1.shouldDream();
    await service1.shouldDream();
    expect(service1.getState().sessionsSinceDream).toBe(2);

    const service2 = new AutoDreamService(memory, { lockfileDir: dir, minSessionGap: 10, minTimeGapMs: 0 });
    expect(service2.getState().sessionsSinceDream).toBe(2);
  });
});
