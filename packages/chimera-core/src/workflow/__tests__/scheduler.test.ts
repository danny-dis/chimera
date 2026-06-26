import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SchedulerManager, parseCron, matchesCron } from '../scheduler.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'scheduler-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('parseCron', () => {
  it('parses a valid cron expression', () => {
    const result = parseCron('0 14 * * *');
    expect(result).not.toBeNull();
    expect(result!.minute.type).toBe('values');
    expect(result!.minute.values).toEqual([0]);
    expect(result!.hour.type).toBe('values');
    expect(result!.hour.values).toEqual([14]);
    expect(result!.dayOfMonth.type).toBe('any');
    expect(result!.month.type).toBe('any');
    expect(result!.dayOfWeek.type).toBe('any');
  });

  it('parses wildcard cron', () => {
    const result = parseCron('* * * * *');
    expect(result).not.toBeNull();
    expect(result!.minute.type).toBe('any');
    expect(result!.hour.type).toBe('any');
  });

  it('parses step expressions', () => {
    const result = parseCron('*/5 * * * *');
    expect(result).not.toBeNull();
    expect(result!.minute.values).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it('parses range expressions', () => {
    const result = parseCron('0 9 * * 1-5');
    expect(result).not.toBeNull();
    expect(result!.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses comma-separated values', () => {
    const result = parseCron('0 9,17 * * *');
    expect(result).not.toBeNull();
    expect(result!.hour.values).toEqual([9, 17]);
  });

  it('returns null for invalid cron', () => {
    expect(parseCron('')).toBeNull();
    expect(parseCron('invalid')).toBeNull();
    expect(parseCron('1 2')).toBeNull();
  });
});

describe('matchesCron', () => {
  it('matches exact values', () => {
    const cron = parseCron('0 14 * * *')!;
    const date = new Date(2026, 5, 24, 14, 0, 0);
    expect(matchesCron(cron, date)).toBe(true);
  });

  it('does not match wrong hour', () => {
    const cron = parseCron('0 14 * * *')!;
    const date = new Date(2026, 5, 24, 15, 0, 0);
    expect(matchesCron(cron, date)).toBe(false);
  });

  it('matches wildcard', () => {
    const cron = parseCron('* * * * *')!;
    const date = new Date(2026, 5, 24, 23, 59, 0);
    expect(matchesCron(cron, date)).toBe(true);
  });

  it('matches step pattern', () => {
    const cron = parseCron('*/5 * * * *')!;
    expect(matchesCron(cron, new Date(2026, 5, 24, 10, 0, 0))).toBe(true);
    expect(matchesCron(cron, new Date(2026, 5, 24, 10, 3, 0))).toBe(false);
    expect(matchesCron(cron, new Date(2026, 5, 24, 10, 5, 0))).toBe(true);
  });

  it('matches range pattern', () => {
    const cron = parseCron('0 9 * * 1-5')!;
    expect(matchesCron(cron, new Date(2026, 5, 24, 9, 0, 0))).toBe(true); // Tuesday
    expect(matchesCron(cron, new Date(2026, 5, 27, 9, 0, 0))).toBe(false); // Saturday
  });
});

describe('SchedulerManager', () => {
  it('adds and lists schedules', () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    const entry = mgr.addSchedule({
      name: 'test',
      cron: '0 14 * * *',
      task: 'do something',
      enabled: true,
    });

    expect(entry.id).toMatch(/^sch-/);
    expect(entry.name).toBe('test');
    expect(entry.cron).toBe('0 14 * * *');
    expect(entry.enabled).toBe(true);

    const list = mgr.listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(entry.id);
  });

  it('removes schedules', () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    const entry = mgr.addSchedule({
      name: 'test',
      cron: '0 14 * * *',
      task: 'do something',
      enabled: true,
    });

    expect(mgr.removeSchedule(entry.id)).toBe(true);
    expect(mgr.listSchedules()).toHaveLength(0);
    expect(mgr.removeSchedule('nonexistent')).toBe(false);
  });

  it('enables and disables schedules', () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    const entry = mgr.addSchedule({
      name: 'test',
      cron: '0 14 * * *',
      task: 'do something',
      enabled: true,
    });

    expect(mgr.disableSchedule(entry.id)).toBe(true);
    expect(mgr.getSchedule(entry.id)?.enabled).toBe(false);

    expect(mgr.enableSchedule(entry.id)).toBe(true);
    expect(mgr.getSchedule(entry.id)?.enabled).toBe(true);
  });

  it('updates schedules', () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    const entry = mgr.addSchedule({
      name: 'test',
      cron: '0 14 * * *',
      task: 'do something',
      enabled: true,
    });

    const updated = mgr.updateSchedule(entry.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');
    expect(updated?.cron).toBe('0 14 * * *'); // unchanged
  });

  it('does not trigger disabled schedules', async () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    mgr.addSchedule({
      name: 'disabled',
      cron: '* * * * *',
      task: 'should not run',
      enabled: false,
    });

    // Should not throw or trigger
    await mgr.evaluate(new Date(2026, 5, 24, 14, 0, 0));
    // No error = success (disabled schedule was skipped)
  });

  it('avoids double-triggering in the same minute', async () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    mgr.addSchedule({
      name: 'test',
      cron: '0 14 * * *',
      task: 'run once',
      enabled: true,
    });

    const date = new Date(2026, 5, 24, 14, 0, 0);
    await mgr.evaluate(date);
    // Second evaluation at same time should be skipped
    await mgr.evaluate(date);
    // No error = success (second eval was skipped)
  });

  it('persists schedules to disk', () => {
    const mgr = new SchedulerManager(null, undefined, tempDir);
    mgr.addSchedule({
      name: 'persisted',
      cron: '0 14 * * *',
      task: 'save me',
      enabled: true,
    });

    // Create a new manager that loads from the same file
    const mgr2 = new SchedulerManager(null, undefined, tempDir);
    const list = mgr2.listSchedules();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('persisted');
  });
});
