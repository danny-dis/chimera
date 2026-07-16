import type { EventStream } from '../event-stream.js';
import type { ScheduleEntry } from './types.js';
import type { WorkflowDispatcher } from './dispatcher.js';
import type { WorkflowHandlers } from './runner.js';
interface CronField {
    type: 'any' | 'values';
    values: number[];
}
interface ParsedCron {
    minute: CronField;
    hour: CronField;
    dayOfMonth: CronField;
    month: CronField;
    dayOfWeek: CronField;
}
declare function parseCron(expr: string): ParsedCron | null;
declare function matchesCron(cron: ParsedCron, date: Date): boolean;
export declare class SchedulerManager {
    private readonly dispatcher;
    private readonly eventStream?;
    private schedules;
    private timer;
    private readonly filePath;
    private lastEvalMinute;
    private readonly providerFactory?;
    /**
     * Optional override. If set, the manager calls it INSTEAD of running the
     * workflow inline — lets a host (daemon) route scheduled work through its
     * own execution path. Receives the built loop workflow + schedule entry.
     */
    onTrigger?: (entry: ScheduleEntry, workflow: unknown) => Promise<void> | void;
    constructor(dispatcher: WorkflowDispatcher | null, eventStream?: EventStream, workspaceRoot?: string, providerFactory?: () => Promise<WorkflowHandlers | null>);
    /** Start the evaluation timer (checks every 60 seconds). */
    start(): void;
    /** Stop the evaluation timer. */
    stop(): void;
    /** Evaluate all schedules against the current time. Called every 60s. */
    evaluate(now?: Date): Promise<void>;
    addSchedule(entry: Omit<ScheduleEntry, 'id' | 'createdAt'>): ScheduleEntry;
    removeSchedule(id: string): boolean;
    updateSchedule(id: string, updates: Partial<ScheduleEntry>): ScheduleEntry | null;
    listSchedules(): ScheduleEntry[];
    getSchedule(id: string): ScheduleEntry | null;
    enableSchedule(id: string): boolean;
    disableSchedule(id: string): boolean;
    private trigger;
    private load;
    private persist;
}
export { parseCron, matchesCron };
//# sourceMappingURL=scheduler.d.ts.map