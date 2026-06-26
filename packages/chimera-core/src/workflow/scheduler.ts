/**
 * SchedulerManager — cron-like periodic workflow execution.
 *
 * Stores schedule entries, evaluates cron expressions on a 60-second timer,
 * and dispatches workflows via WorkflowDispatcher when a schedule triggers.
 *
 * Schedules persist to `.chimera/schedules.json` and survive daemon restarts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { EventStream } from '../event-stream.js';
import type { ScheduleEntry } from './types.js';
import type { WorkflowDispatcher } from './dispatcher.js';
import type { WorkflowHandlers } from './runner.js';

// ---------------------------------------------------------------------------
// Cron parsing (minimal, zero-dependency)
// ---------------------------------------------------------------------------

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

function parseCronField(field: string, min: number, max: number): CronField {
  if (field === '*') return { type: 'any', values: [] };

  const values = new Set<number>();

  for (const part of field.split(',')) {
    // Step: */5 or 1-10/2
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (stepMatch[1] === '*') {
        for (let i = min; i <= max; i += step) values.add(i);
      } else {
        const range = parseRange(stepMatch[1], min, max);
        for (let i = range[0]; i <= range[1]; i += step) values.add(i);
      }
      continue;
    }

    // Range: 1-5
    if (part.includes('-')) {
      const [a, b] = parseRange(part, min, max);
      for (let i = a; i <= b; i++) values.add(i);
      continue;
    }

    // Single value
    const v = parseInt(part, 10);
    if (!isNaN(v) && v >= min && v <= max) values.add(v);
  }

  return { type: 'values', values: Array.from(values) };
}

function parseRange(field: string, min: number, max: number): [number, number] {
  const [aStr, bStr] = field.split('-');
  const a = Math.max(min, parseInt(aStr, 10));
  const b = Math.min(max, parseInt(bStr, 10));
  return [a, b];
}

function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

function matchesCronField(field: CronField, value: number): boolean {
  if (field.type === 'any') return true;
  return field.values.includes(value);
}

function matchesCron(cron: ParsedCron, date: Date): boolean {
  return (
    matchesCronField(cron.minute, date.getMinutes()) &&
    matchesCronField(cron.hour, date.getHours()) &&
    matchesCronField(cron.dayOfMonth, date.getDate()) &&
    matchesCronField(cron.month, date.getMonth() + 1) &&
    matchesCronField(cron.dayOfWeek, date.getDay())
  );
}

// ---------------------------------------------------------------------------
// SchedulerManager
// ---------------------------------------------------------------------------

export class SchedulerManager {
  private schedules: Map<string, ScheduleEntry> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly filePath: string;
  private lastEvalMinute = -1;

  constructor(
    private readonly dispatcher: WorkflowDispatcher | null,
    private readonly eventStream?: EventStream,
    workspaceRoot?: string,
  ) {
    const root = workspaceRoot ?? process.cwd();
    this.filePath = join(root, '.chimera', 'schedules.json');
    this.load();
  }

  // ── Timer lifecycle ────────────────────────────────────────────────

  /** Start the evaluation timer (checks every 60 seconds). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.evaluate(), 60_000);
  }

  /** Stop the evaluation timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Evaluate all schedules against the current time. Called every 60s. */
  async evaluate(now?: Date): Promise<void> {
    const current = now ?? new Date();
    const currentMinute = current.getHours() * 60 + current.getMinutes();

    // Avoid double-triggering within the same minute
    if (currentMinute === this.lastEvalMinute) return;
    this.lastEvalMinute = currentMinute;

    for (const entry of this.schedules.values()) {
      if (!entry.enabled) continue;

      const parsed = parseCron(entry.cron);
      if (!parsed) continue;

      if (matchesCron(parsed, current)) {
        await this.trigger(entry);
      }
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────

  addSchedule(
    entry: Omit<ScheduleEntry, 'id' | 'createdAt'>,
  ): ScheduleEntry {
    const id = `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const full: ScheduleEntry = {
      ...entry,
      id,
      createdAt: new Date().toISOString(),
    };
    this.schedules.set(id, full);
    this.persist();
    return full;
  }

  removeSchedule(id: string): boolean {
    const existed = this.schedules.delete(id);
    if (existed) this.persist();
    return existed;
  }

  updateSchedule(id: string, updates: Partial<ScheduleEntry>): ScheduleEntry | null {
    const existing = this.schedules.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.schedules.set(id, updated);
    this.persist();
    return updated;
  }

  listSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values());
  }

  getSchedule(id: string): ScheduleEntry | null {
    return this.schedules.get(id) ?? null;
  }

  enableSchedule(id: string): boolean {
    return this.updateSchedule(id, { enabled: true }) !== null;
  }

  disableSchedule(id: string): boolean {
    return this.updateSchedule(id, { enabled: false }) !== null;
  }

  // ── Trigger ────────────────────────────────────────────────────────

  private async trigger(entry: ScheduleEntry): Promise<void> {
    this.eventStream?.append({
      type: 'workflow_dispatched' as any,
      workflowRunId: `schedule-${entry.id}`,
      workflowName: entry.workflow ?? 'scheduled-loop',
    } as any);

    // Build a default loop workflow if none provided
    const workflow = {
      name: entry.workflow ?? 'scheduled-loop',
      steps: [{
        id: 'loop',
        kind: 'loop' as const,
        config: {
          prompt: entry.task ?? '',
          until: 'COMPLETE',
          max_iterations: entry.maxIterations ?? 10,
          fresh_context: true,
          role: 'writer',
        },
      }],
    };

    // Use dispatcher if available, otherwise run directly
    if (this.dispatcher) {
      const providers = await this.getDefaultProviders();
      if (providers) {
        this.dispatcher.dispatch(workflow as any, {
          handlers: providers,
          runId: `schedule-${entry.id}-${Date.now()}`,
        });
      }
    }

    // Update last run info
    this.updateSchedule(entry.id, {
      lastRunAt: Date.now(),
    });
  }

  private async getDefaultProviders(): Promise<WorkflowHandlers | null> {
    // Return null if no providers configured — the trigger will be a no-op
    // The actual provider setup should come from the caller (CLI/daemon)
    return null;
  }

  // ── Persistence ────────────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw) as ScheduleEntry[];
        for (const entry of data) {
          this.schedules.set(entry.id, entry);
        }
      }
    } catch {
      // Start with empty schedules on parse error
    }
  }

  private persist(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.schedules.values());
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Persist failures are non-fatal — schedules stay in memory
    }
  }
}

// ── Exports ────────────────────────────────────────────────────────
export { parseCron, matchesCron };
