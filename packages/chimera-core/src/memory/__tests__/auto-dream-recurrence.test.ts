/**
 * Regression tests for auto-dream recurrence threshold.
 *
 * BUG: auto-dream.ts:99 checks `items.length < recurrenceThreshold` but
 *     line 111 compares `similarCount >= recurrenceThreshold` where
 *     similarCount EXCLUDES the anchor item (i === j is skipped).
 *     This means the threshold is off by one: with threshold=5, you need
 *     5 SIMILAR neighbors (6 total items) instead of 5 total items.
 *
 * ADDITIONAL BUG: The legacy auto-dream test expects gap-only trigger
 *     despite recurrence default true. The test should opt out explicitly
 *     with `enableRecurrenceTrigger: false`.
 *
 * EXPECTED (after fix):
 *   - Recurrence threshold INCLUDES the anchor item
 *   - Empty memory → no dream (below threshold)
 *   - Exact threshold → dream
 *   - Below threshold → no dream
 *   - Disabled recurrence → falls back to session-gap only
 */
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
  return path.join(os.tmpdir(), `chimera-dream-rec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('auto-dream recurrence threshold', () => {
  let memory: LongTermMemory;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    memory = new LongTermMemory();
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('empty memory should not trigger recurrence dream', async () => {
    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 1,
      minTimeGapMs: 0,
      recurrenceThreshold: 5,
      enableRecurrenceTrigger: true,
    });

    // Empty memory — should not dream
    expect(await service.shouldDream()).toBe(false);
  });

  it('below threshold should not trigger recurrence dream', async () => {
    // Write 3 similar items (below threshold of 5)
    for (let i = 0; i < 3; i++) {
      await memory.write({ content: `fact ${i}`, topic: 't', importance: 0.9 });
    }

    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 1,
      minTimeGapMs: 0,
      recurrenceThreshold: 5,
      enableRecurrenceTrigger: true,
    });

    expect(await service.shouldDream()).toBe(false);
  });

  it('exact threshold should trigger recurrence dream', async () => {
    // Write exactly 5 similar items (at threshold of 5)
    for (let i = 0; i < 5; i++) {
      await memory.write({ content: `fact ${i}`, topic: 't', importance: 0.9 });
    }

    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 1,
      minTimeGapMs: 0,
      recurrenceThreshold: 5,
      recurrenceSimilarity: 0,
      enableRecurrenceTrigger: true,
    });

    // After fix: 5 items at threshold should trigger (anchor + 4 neighbors = 5)
    // Before fix: needs 5 neighbors (6 total) so this returns false
    expect(await service.shouldDream()).toBe(true);
  });

  it('above threshold should trigger recurrence dream', async () => {
    // Write 10 similar items (above threshold of 5)
    for (let i = 0; i < 10; i++) {
      await memory.write({ content: `fact ${i}`, topic: 't', importance: 0.9 });
    }

    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 1,
      minTimeGapMs: 0,
      recurrenceThreshold: 5,
      recurrenceSimilarity: 0,
      enableRecurrenceTrigger: true,
    });

    expect(await service.shouldDream()).toBe(true);
  });

  it('disabled recurrence falls back to session-gap only', async () => {
    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 3,
      minTimeGapMs: 0,
      enableRecurrenceTrigger: false,
    });

    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
    // Third call should trigger (session gap met, recurrence disabled)
    expect(await service.shouldDream()).toBe(true);
  });

  it('legacy gap-only test opts out explicitly', async () => {
    // This test documents the legacy behavior: gap-only trigger
    // requires explicit opt-out via enableRecurrenceTrigger: false
    const service = new AutoDreamService(memory, {
      lockfileDir: dir,
      minSessionGap: 3,
      minTimeGapMs: 0,
      enableRecurrenceTrigger: false,
    });

    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(false);
    expect(await service.shouldDream()).toBe(true);
  });
});
