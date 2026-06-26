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
export declare class BackgroundTaskManager extends EventEmitter {
    private queue;
    private activeWorkers;
    private maxWorkers;
    constructor(maxWorkers?: number);
    /**
     * Adjusts the maximum number of parallel workers at runtime.
     */
    setMaxWorkers(count: number): void;
    /**
     * Adds a task to the background execution queue.
     */
    addTask<T>(task: Omit<BackgroundTask<T>, 'status' | 'createdAt'>): string;
    /**
     * Gets the status of a specific task.
     */
    getTaskStatus(taskId: string): BackgroundTask | undefined;
    /**
     * Lists all tasks in the manager.
     */
    listTasks(): BackgroundTask[];
    private sortQueue;
    private processQueue;
}
//# sourceMappingURL=background-task-manager.d.ts.map