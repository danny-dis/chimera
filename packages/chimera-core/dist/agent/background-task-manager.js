"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundTaskManager = void 0;
const events_1 = require("events");
class BackgroundTaskManager extends events_1.EventEmitter {
    queue = [];
    activeWorkers = 0;
    maxWorkers;
    constructor(maxWorkers = 4) {
        super();
        this.maxWorkers = maxWorkers;
    }
    /**
     * Adjusts the maximum number of parallel workers at runtime.
     */
    setMaxWorkers(count) {
        this.maxWorkers = Math.max(1, count);
        this.processQueue(); // Try to start more tasks if count increased
    }
    /**
     * Adds a task to the background execution queue.
     */
    addTask(task) {
        const fullTask = {
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
    getTaskStatus(taskId) {
        return this.queue.find(t => t.id === taskId);
    }
    /**
     * Lists all tasks in the manager.
     */
    listTasks() {
        return [...this.queue];
    }
    sortQueue() {
        this.queue.sort((a, b) => {
            // Higher priority first
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            // Older tasks first for same priority
            return a.createdAt - b.createdAt;
        });
    }
    async processQueue() {
        if (this.activeWorkers >= this.maxWorkers)
            return;
        const nextTask = this.queue.find(t => t.status === 'queued');
        if (!nextTask)
            return;
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
        }
        catch (error) {
            nextTask.status = 'failed';
            nextTask.error = error.message || String(error);
            nextTask.completedAt = Date.now();
            this.emit('task_failed', nextTask);
        }
        finally {
            this.activeWorkers--;
            this.processQueue();
        }
    }
}
exports.BackgroundTaskManager = BackgroundTaskManager;
//# sourceMappingURL=background-task-manager.js.map