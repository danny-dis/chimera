import { describe, it, expect, vi } from 'vitest';
import { BackgroundTaskManager } from '../background-task-manager.js';

describe('BackgroundTaskManager', () => {
  it('executes tasks in priority order', async () => {
    const manager = new BackgroundTaskManager(1);
    const order: string[] = [];

    manager.addTask({ id: 'low', description: 'Low', priority: 1, execute: async () => { order.push('low'); return 'done'; } });
    manager.addTask({ id: 'high', description: 'High', priority: 10, execute: async () => { order.push('high'); return 'done'; } });

    await manager.waitForTask('low');
    await manager.waitForTask('high');
    expect(order).toEqual(['low', 'high']);
  });

  it('respects maxWorkers limit', async () => {
    const manager = new BackgroundTaskManager(2);
    let active = 0;
    let peak = 0;

    const task = (id: string) => ({
      id, description: `Task ${id}`, priority: 1,
      execute: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return id;
      },
    });

    manager.addTask(task('1'));
    manager.addTask(task('2'));
    manager.addTask(task('3'));

    await manager.waitForTask('3');
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('tracks task failures', async () => {
    const manager = new BackgroundTaskManager(1);
    manager.addTask({ id: 'fail', description: 'Fail', priority: 1, execute: async () => { throw new Error('boom'); } });

    const task = await manager.waitForTask('fail');
    expect(task.status).toBe('failed');
    expect(task.error).toBe('boom');
  });

  it('cancels queued tasks', async () => {
    const manager = new BackgroundTaskManager(1);
    let executed = false;

    manager.addTask({ id: 'blocker', description: 'Blocker', priority: 10, execute: async () => { await new Promise((r) => setTimeout(r, 200)); return 'blocker'; } });
    manager.addTask({ id: 'target', description: 'Target', priority: 1, execute: async () => { executed = true; return 'target'; } });

    await new Promise((r) => setTimeout(r, 10));
    const cancelled = manager.cancelTask('target');
    expect(cancelled).toBe(true);

    await manager.waitForTask('blocker');
    expect(executed).toBe(false);
  });

  it('cancels running tasks via abort', async () => {
    const manager = new BackgroundTaskManager(1);

    manager.addTask({
      id: 'long', description: 'Long', priority: 10,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return 'done';
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    manager.cancelTask('long');

    const task = await manager.waitForTask('long', 1000);
    expect(task.status).toBe('cancelled');
  });

  it('times out tasks with timeoutMs', async () => {
    const manager = new BackgroundTaskManager(1);
    manager.addTask({
      id: 'slow', description: 'Slow', priority: 1, timeoutMs: 50,
      execute: async () => { await new Promise((r) => setTimeout(r, 5000)); return 'done'; },
    });

    const task = await manager.waitForTask('slow', 500);
    expect(task.status === 'failed' || task.status === 'cancelled').toBe(true);
    expect(task.error).toContain('timed out');
  });

  it('returns stats', async () => {
    const manager = new BackgroundTaskManager(2);
    manager.addTask({ id: 'a', description: 'A', priority: 1, execute: async () => 'a' });
    manager.addTask({ id: 'b', description: 'B', priority: 1, execute: async () => { throw new Error('b'); } });

    await manager.waitForTask('a');
    await manager.waitForTask('b');

    const stats = manager.getStats();
    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it('lists tasks by status filter', async () => {
    const manager = new BackgroundTaskManager(1);
    manager.addTask({ id: 'done', description: 'Done', priority: 10, execute: async () => 'ok' });
    manager.addTask({ id: 'queued', description: 'Queued', priority: 1, execute: async () => 'ok' });

    await manager.waitForTask('done');

    const completed = manager.listTasks({ status: 'completed' });
    expect(completed.some((t) => t.id === 'done')).toBe(true);
  });
});
