"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundTaskManager = void 0;
const events_1 = require("events");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const PERSISTENT_STATUSES = ['queued', 'running'];
class BackgroundTaskManager extends events_1.EventEmitter {
    queue = [];
    activeWorkers = 0;
    maxWorkers;
    abortControllers = new Map();
    workspaceRoot;
    onCompleteHook;
    persistPath;
    constructor(maxWorkers = 4, options) {
        super();
        this.maxWorkers = maxWorkers;
        this.workspaceRoot = options?.workspaceRoot;
        this.onCompleteHook = options?.onComplete;
        this.persistPath = this.workspaceRoot
            ? (0, node_path_1.join)(this.workspaceRoot, '.chimera', 'background-tasks.json')
            : undefined;
        if (this.persistPath) {
            this.reloadPersisted();
        }
    }
    /**
     * On construction, load any unfinished tasks recorded in the persistence
     * file. Closures cannot be serialized, so we cannot resume them — we log
     * that they were scheduled and must be re-submitted by the caller. The
     * in-memory queue starts empty.
     */
    async reloadPersisted() {
        try {
            const raw = await (0, promises_1.readFile)(this.persistPath, 'utf8');
            const records = JSON.parse(raw);
            const unfinished = records.filter((r) => PERSISTENT_STATUSES.includes(r.status));
            if (unfinished.length > 0) {
                console.warn(`[background-task-manager] Loaded ${unfinished.length} unfinished background task(s) from ` +
                    `${this.persistPath}. Their closures are gone and must be re-submitted by the caller.`);
            }
        }
        catch {
            // No file yet, or unreadable/corrupt — start fresh.
        }
    }
    async persist() {
        if (!this.persistPath)
            return;
        const records = this.queue
            .filter((t) => PERSISTENT_STATUSES.includes(t.status))
            .map((t) => ({
            id: t.id,
            type: t.type,
            label: t.label,
            status: t.status,
            createdAt: t.createdAt,
        }));
        try {
            await (0, promises_1.mkdir)((0, node_path_1.join)(this.workspaceRoot, '.chimera'), { recursive: true });
            await (0, promises_1.writeFile)(this.persistPath, JSON.stringify(records, null, 2), 'utf8');
        }
        catch (err) {
            console.error(`[background-task-manager] persist failed: ${String(err)}`);
        }
    }
    setMaxWorkers(count) {
        this.maxWorkers = Math.max(1, count);
        this.processQueue();
    }
    addTask(task) {
        const fullTask = {
            ...task,
            status: 'queued',
            createdAt: Date.now(),
        };
        this.queue.push(fullTask);
        this.sortQueue();
        this.persist();
        this.emit('task_queued', fullTask);
        this.processQueue();
        return fullTask.id;
    }
    /** Update the persisted record for a task (e.g. after completion). */
    markCompleted(id) {
        const task = this.queue.find((t) => t.id === id);
        if (task) {
            task.status = 'completed';
            task.completedAt = task.completedAt ?? Date.now();
        }
        this.persist();
    }
    cancelTask(taskId) {
        const task = this.queue.find((t) => t.id === taskId);
        if (!task)
            return false;
        if (task.status === 'queued') {
            task.status = 'cancelled';
            task.completedAt = Date.now();
            this.persist();
            this.emit('task_cancelled', task);
            return true;
        }
        if (task.status === 'running') {
            const controller = this.abortControllers.get(taskId);
            if (controller) {
                controller.abort();
                this.abortControllers.delete(taskId);
            }
            task.status = 'cancelled';
            task.completedAt = Date.now();
            this.persist();
            this.emit('task_cancelled', task);
            return true;
        }
        return false;
    }
    getTaskStatus(taskId) {
        return this.queue.find((t) => t.id === taskId);
    }
    listTasks(filter) {
        if (!filter?.status)
            return [...this.queue];
        return this.queue.filter((t) => t.status === filter.status);
    }
    getStats() {
        const counts = { total: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
        for (const task of this.queue) {
            counts.total++;
            counts[task.status]++;
        }
        return counts;
    }
    async waitForTask(taskId, timeoutMs = 60_000) {
        const existing = this.queue.find((t) => t.id === taskId);
        if (!existing)
            throw new Error(`Task ${taskId} not found`);
        if (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'cancelled') {
            return existing;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListener('task_completed', onComplete);
                this.removeListener('task_failed', onFail);
                this.removeListener('task_cancelled', onCancel);
                reject(new Error(`waitForTask ${taskId} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            const onComplete = (task) => {
                if (task.id === taskId) {
                    clearTimeout(timer);
                    this.removeListener('task_failed', onFail);
                    this.removeListener('task_cancelled', onCancel);
                    resolve(task);
                }
            };
            const onFail = (task) => {
                if (task.id === taskId) {
                    clearTimeout(timer);
                    this.removeListener('task_completed', onComplete);
                    this.removeListener('task_cancelled', onCancel);
                    resolve(task);
                }
            };
            const onCancel = (task) => {
                if (task.id === taskId) {
                    clearTimeout(timer);
                    this.removeListener('task_completed', onComplete);
                    this.removeListener('task_failed', onFail);
                    resolve(task);
                }
            };
            this.on('task_completed', onComplete);
            this.on('task_failed', onFail);
            this.on('task_cancelled', onCancel);
        });
    }
    sortQueue() {
        this.queue.sort((a, b) => {
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            return a.createdAt - b.createdAt;
        });
    }
    async processQueue() {
        if (this.activeWorkers >= this.maxWorkers)
            return;
        const nextTask = this.queue.find((t) => t.status === 'queued');
        if (!nextTask)
            return;
        this.activeWorkers++;
        nextTask.status = 'running';
        nextTask.startedAt = Date.now();
        this.persist();
        this.emit('task_started', nextTask);
        const controller = new AbortController();
        this.abortControllers.set(nextTask.id, controller);
        try {
            const executePromise = nextTask.execute();
            if (nextTask.timeoutMs) {
                const timeoutPromise = new Promise((_, reject) => {
                    const timer = setTimeout(() => {
                        controller.abort();
                        reject(new Error(`Task ${nextTask.id} timed out after ${nextTask.timeoutMs}ms`));
                    }, nextTask.timeoutMs);
                    controller.signal.addEventListener('abort', () => clearTimeout(timer));
                });
                nextTask.result = await Promise.race([executePromise, timeoutPromise]);
            }
            else {
                nextTask.result = await executePromise;
            }
            if (controller.signal.aborted) {
                nextTask.status = 'cancelled';
                nextTask.error = 'Cancelled';
            }
            else {
                nextTask.status = 'completed';
            }
            nextTask.completedAt = Date.now();
            this.persist();
            this.emit('task_completed', nextTask);
            if (nextTask.status === 'completed' && this.onCompleteHook) {
                this.onCompleteHook(nextTask).catch((err) => console.error(`[background-task-manager] onComplete hook failed for ${nextTask.id}: ${String(err)}`));
            }
        }
        catch (error) {
            nextTask.status = controller.signal.aborted ? 'cancelled' : 'failed';
            nextTask.error = error.message || String(error);
            nextTask.completedAt = Date.now();
            this.persist();
            this.emit(nextTask.status === 'cancelled' ? 'task_cancelled' : 'task_failed', nextTask);
        }
        finally {
            this.abortControllers.delete(nextTask.id);
            this.activeWorkers--;
            this.processQueue();
        }
    }
}
exports.BackgroundTaskManager = BackgroundTaskManager;
//# sourceMappingURL=background-task-manager.js.map