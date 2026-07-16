"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerManager = void 0;
exports.parseCron = parseCron;
exports.matchesCron = matchesCron;
/**
 * SchedulerManager — cron-like periodic workflow execution.
 *
 * Stores schedule entries, evaluates cron expressions on a 60-second timer,
 * and dispatches workflows via WorkflowDispatcher when a schedule triggers.
 *
 * Schedules persist to `.chimera/schedules.json` and survive daemon restarts.
 */
const fs_1 = require("fs");
const path_1 = require("path");
const runner_js_1 = require("./runner.js");
function parseCronField(field, min, max) {
    if (field === '*')
        return { type: 'any', values: [] };
    const values = new Set();
    for (const part of field.split(',')) {
        // Step: */5 or 1-10/2
        const stepMatch = part.match(/^(.+)\/(\d+)$/);
        if (stepMatch) {
            const step = parseInt(stepMatch[2], 10);
            if (stepMatch[1] === '*') {
                for (let i = min; i <= max; i += step)
                    values.add(i);
            }
            else {
                const range = parseRange(stepMatch[1], min, max);
                for (let i = range[0]; i <= range[1]; i += step)
                    values.add(i);
            }
            continue;
        }
        // Range: 1-5
        if (part.includes('-')) {
            const [a, b] = parseRange(part, min, max);
            for (let i = a; i <= b; i++)
                values.add(i);
            continue;
        }
        // Single value
        const v = parseInt(part, 10);
        if (!isNaN(v) && v >= min && v <= max)
            values.add(v);
    }
    return { type: 'values', values: Array.from(values) };
}
function parseRange(field, min, max) {
    const [aStr, bStr] = field.split('-');
    const a = Math.max(min, parseInt(aStr, 10));
    const b = Math.min(max, parseInt(bStr, 10));
    return [a, b];
}
function parseCron(expr) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5)
        return null;
    return {
        minute: parseCronField(parts[0], 0, 59),
        hour: parseCronField(parts[1], 0, 23),
        dayOfMonth: parseCronField(parts[2], 1, 31),
        month: parseCronField(parts[3], 1, 12),
        dayOfWeek: parseCronField(parts[4], 0, 6),
    };
}
function matchesCronField(field, value) {
    if (field.type === 'any')
        return true;
    return field.values.includes(value);
}
function matchesCron(cron, date) {
    return (matchesCronField(cron.minute, date.getMinutes()) &&
        matchesCronField(cron.hour, date.getHours()) &&
        matchesCronField(cron.dayOfMonth, date.getDate()) &&
        matchesCronField(cron.month, date.getMonth() + 1) &&
        matchesCronField(cron.dayOfWeek, date.getDay()));
}
// ---------------------------------------------------------------------------
// SchedulerManager
// ---------------------------------------------------------------------------
class SchedulerManager {
    dispatcher;
    eventStream;
    schedules = new Map();
    timer = null;
    filePath;
    lastEvalMinute = -1;
    providerFactory;
    /**
     * Optional override. If set, the manager calls it INSTEAD of running the
     * workflow inline — lets a host (daemon) route scheduled work through its
     * own execution path. Receives the built loop workflow + schedule entry.
     */
    onTrigger;
    constructor(dispatcher, eventStream, workspaceRoot, providerFactory) {
        this.dispatcher = dispatcher;
        this.eventStream = eventStream;
        const root = workspaceRoot ?? process.cwd();
        this.filePath = (0, path_1.join)(root, '.chimera', 'schedules.json');
        this.providerFactory = providerFactory;
        this.load();
    }
    // ── Timer lifecycle ────────────────────────────────────────────────
    /** Start the evaluation timer (checks every 60 seconds). */
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => this.evaluate(), 60_000);
    }
    /** Stop the evaluation timer. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /** Evaluate all schedules against the current time. Called every 60s. */
    async evaluate(now) {
        const current = now ?? new Date();
        const currentMinute = current.getHours() * 60 + current.getMinutes();
        // Avoid double-triggering within the same minute
        if (currentMinute === this.lastEvalMinute)
            return;
        this.lastEvalMinute = currentMinute;
        for (const entry of this.schedules.values()) {
            if (!entry.enabled)
                continue;
            const parsed = parseCron(entry.cron);
            if (!parsed)
                continue;
            if (matchesCron(parsed, current)) {
                await this.trigger(entry);
            }
        }
    }
    // ── CRUD ───────────────────────────────────────────────────────────
    addSchedule(entry) {
        const id = `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const full = {
            ...entry,
            id,
            createdAt: new Date().toISOString(),
        };
        this.schedules.set(id, full);
        this.persist();
        return full;
    }
    removeSchedule(id) {
        const existed = this.schedules.delete(id);
        if (existed)
            this.persist();
        return existed;
    }
    updateSchedule(id, updates) {
        const existing = this.schedules.get(id);
        if (!existing)
            return null;
        const updated = { ...existing, ...updates, id };
        this.schedules.set(id, updated);
        this.persist();
        return updated;
    }
    listSchedules() {
        return Array.from(this.schedules.values());
    }
    getSchedule(id) {
        return this.schedules.get(id) ?? null;
    }
    enableSchedule(id) {
        return this.updateSchedule(id, { enabled: true }) !== null;
    }
    disableSchedule(id) {
        return this.updateSchedule(id, { enabled: false }) !== null;
    }
    // ── Trigger ────────────────────────────────────────────────────────
    async trigger(entry) {
        this.eventStream?.append({
            type: 'workflow_dispatched',
            workflowRunId: `schedule-${entry.id}`,
            workflowName: entry.workflow ?? 'scheduled-loop',
        });
        // Build a default loop workflow if none provided
        const workflow = {
            name: entry.workflow ?? 'scheduled-loop',
            steps: [{
                    id: 'loop',
                    kind: 'loop',
                    config: {
                        prompt: entry.task ?? '',
                        until: 'COMPLETE',
                        max_iterations: entry.maxIterations ?? 10,
                        fresh_context: true,
                        role: 'writer',
                    },
                }],
        };
        // No provider factory wired → the trigger is a no-op. The caller
        // (CLI REPL / daemon) must inject one via the constructor, or set onTrigger.
        if (!this.providerFactory && !this.onTrigger)
            return;
        if (this.onTrigger) {
            await this.onTrigger(entry, workflow);
            return;
        }
        const handlers = await this.providerFactory();
        if (!handlers)
            return;
        // Use dispatcher if available, otherwise run directly
        if (this.dispatcher) {
            this.dispatcher.dispatch(workflow, {
                handlers,
                runId: `schedule-${entry.id}-${Date.now()}`,
            });
        }
        else {
            // ponytail: no dispatcher → run inline (caller owns concurrency limits)
            (0, runner_js_1.runWorkflow)(workflow, { handlers }).catch((err) => {
                this.eventStream?.append({ type: 'workflow_dispatch_failed', error: String(err) });
            });
        }
        // Update last run info
        this.updateSchedule(entry.id, {
            lastRunAt: Date.now(),
        });
    }
    // ── Persistence ────────────────────────────────────────────────────
    load() {
        try {
            if ((0, fs_1.existsSync)(this.filePath)) {
                const raw = (0, fs_1.readFileSync)(this.filePath, 'utf-8');
                const data = JSON.parse(raw);
                for (const entry of data) {
                    this.schedules.set(entry.id, entry);
                }
            }
        }
        catch {
            // Start with empty schedules on parse error
        }
    }
    persist() {
        try {
            const dir = (0, path_1.dirname)(this.filePath);
            if (!(0, fs_1.existsSync)(dir)) {
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            }
            const data = Array.from(this.schedules.values());
            (0, fs_1.writeFileSync)(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
        }
        catch {
            // Persist failures are non-fatal — schedules stay in memory
        }
    }
}
exports.SchedulerManager = SchedulerManager;
//# sourceMappingURL=scheduler.js.map