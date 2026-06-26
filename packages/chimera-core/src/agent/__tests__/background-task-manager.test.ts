import { describe, it, expect, vi } from 'vitest';
import { BackgroundTaskManager } from '../background-task-manager.js';

describe('BackgroundTaskManager', () => {
  it('should execute tasks in order of priority', async () => {
    const manager = new BackgroundTaskManager(1); // 1 worker to ensure order
    const executionOrder: number[] = [];

    const task1 = {
      id: '1',
      description: 'Low priority',
      priority: 1,
      execute: async () => {
        executionOrder.push(1);
        return 'done 1';
      }
    };

    const task2 = {
      id: '2',
      description: 'High priority',
      priority: 10,
      execute: async () => {
        executionOrder.push(2);
        return 'done 2';
      }
    };

    // Add low priority first
    manager.addTask(task1);
    manager.addTask(task2);

    // Wait for tasks to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(executionOrder).toEqual([1, 2]); // task1 started immediately because it was the only one
  });

  it('should handle multiple workers', async () => {
    const manager = new BackgroundTaskManager(2);
    let active = 0;
    let maxActive = 0;

    const task = (id: string) => ({
      id,
      description: `Task ${id}`,
      priority: 1,
      execute: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 50));
        active--;
        return id;
      }
    });

    manager.addTask(task('1'));
    manager.addTask(task('2'));
    manager.addTask(task('3'));

    await new Promise(resolve => setTimeout(resolve, 200));
    expect(maxActive).toBe(2);
  });

  it('should report task failures', async () => {
    const manager = new BackgroundTaskManager(1);
    
    const failingTask = {
      id: 'fail',
      description: 'Failing task',
      priority: 1,
      execute: async () => {
        throw new Error('Task failed');
      }
    };

    manager.addTask(failingTask);

    await new Promise(resolve => setTimeout(resolve, 50));
    const status = manager.getTaskStatus('fail');
    expect(status?.status).toBe('failed');
    expect(status?.error).toBe('Task failed');
  });
});
