import { EventEmitter } from 'events';
export interface BackgroundTask<T = any> {
    id: string;
    description: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    result?: T;
    error?: string;
    timeoutMs?: number;
    execute: () => Promise<T>;
}
export interface TaskStats {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
}
export declare class BackgroundTaskManager extends EventEmitter {
    private queue;
    private activeWorkers;
    private maxWorkers;
    private abortControllers;
    constructor(maxWorkers?: number);
    setMaxWorkers(count: number): void;
    addTask<T>(task: Omit<BackgroundTask<T>, 'status' | 'createdAt'>): string;
    cancelTask(taskId: string): boolean;
    getTaskStatus(taskId: string): BackgroundTask | undefined;
    listTasks(filter?: {
        status?: BackgroundTask['status'];
    }): BackgroundTask[];
    getStats(): TaskStats;
    waitForTask(taskId: string, timeoutMs?: number): Promise<BackgroundTask>;
    private sortQueue;
    private processQueue;
}
//# sourceMappingURL=background-task-manager.d.ts.map