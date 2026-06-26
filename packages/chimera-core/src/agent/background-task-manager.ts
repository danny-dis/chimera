import { EventEmitter } from 'events';

export interface BackgroundTask<T = any> {
  id: string;
  description: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  priority: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: T;
  error?: string;
  execute: () => Promise<T>;
}

export class BackgroundTaskManager extends EventEmitter {
  private queue: BackgroundTask[] = [];
  private activeWorkers = 0;
  private maxWorkers: number;

  constructor(maxWorkers = 4) {
    super();
    this.maxWorkers = maxWorkers;
  }

  /**
   * Adjusts the maximum number of parallel workers at runtime.
   */
  setMaxWorkers(count: number) {
    this.maxWorkers = Math.max(1, count);
    this.processQueue(); // Try to start more tasks if count increased
  }

  /**
   * Adds a task to the background execution queue.
   */
  addTask<T>(task: Omit<BackgroundTask<T>, 'status' | 'createdAt'>): string {
    const fullTask: BackgroundTask<T> = {
      ...task,
      status: 'queued',
      createdAt: Date.now(),
    };

    this.queue.push(fullTask);
    this.sortQueue();
    
    this.emit('task_queued', fullTask);
    this.processQueue();
    
    return fullTask.id;
  }

  /**
   * Gets the status of a specific task.
   */
  getTaskStatus(taskId: string): BackgroundTask | undefined {
    return this.queue.find(t => t.id === taskId);
  }

  /**
   * Lists all tasks in the manager.
   */
  listTasks(): BackgroundTask[] {
    return [...this.queue];
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Older tasks first for same priority
      return a.createdAt - b.createdAt;
    });
  }

  private async processQueue() {
    if (this.activeWorkers >= this.maxWorkers) return;

    const nextTask = this.queue.find(t => t.status === 'queued');
    if (!nextTask) return;

    this.activeWorkers++;
    nextTask.status = 'running';
    nextTask.startedAt = Date.now();
    this.emit('task_started', nextTask);

    try {
      const result = await nextTask.execute();
      nextTask.status = 'completed';
      nextTask.result = result;
      nextTask.completedAt = Date.now();
      this.emit('task_completed', nextTask);
    } catch (error: any) {
      nextTask.status = 'failed';
      nextTask.error = error.message || String(error);
      nextTask.completedAt = Date.now();
      this.emit('task_failed', nextTask);
    } finally {
      this.activeWorkers--;
      this.processQueue();
    }
  }
}
