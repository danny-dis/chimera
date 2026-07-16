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
    /** Optional classification used for persistence metadata. */
    type?: string;
    /** Optional human label used for persistence metadata. */
    label?: string;
    execute: () => Promise<T>;
}
/** Metadata-only record persisted to disk (never the closure). */
export interface PersistedBackgroundTask {
    id: string;
    type?: string;
    label?: string;
    status: BackgroundTask['status'];
    createdAt: number;
}
export interface TaskStats {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
}
export interface BackgroundTaskManagerOptions {
    /** Workspace root under which `.chimera/background-tasks.json` is stored. */
    workspaceRoot?: string;
    /**
     * Opt-in completion hook. Invoked (fire-and-forget, errors logged) after a
     * task finishes successfully. The CLI may pass a hook that merges the
     * task's worktree / opens a PR. NOT awaited inside the worker loop.
     */
    onComplete?: (task: BackgroundTask) => Promise<void>;
}
export declare class BackgroundTaskManager extends EventEmitter {
    private queue;
    private activeWorkers;
    private maxWorkers;
    private abortControllers;
    private readonly workspaceRoot?;
    private readonly onCompleteHook?;
    private readonly persistPath?;
    constructor(maxWorkers?: number, options?: BackgroundTaskManagerOptions);
    /**
     * On construction, load any unfinished tasks recorded in the persistence
     * file. Closures cannot be serialized, so we cannot resume them — we log
     * that they were scheduled and must be re-submitted by the caller. The
     * in-memory queue starts empty.
     */
    private reloadPersisted;
    private persist;
    setMaxWorkers(count: number): void;
    addTask<T>(task: Omit<BackgroundTask<T>, 'status' | 'createdAt'>): string;
    /** Update the persisted record for a task (e.g. after completion). */
    markCompleted(id: string): void;
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