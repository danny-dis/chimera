// =============================================================================
// DurableEventLog — append-only, file-backed event log.
// Survives process restarts: events are flushed to disk as they arrive,
// and the log replays from disk on construction.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface DurableEvent {
  id: string;
  type: string;
  sessionId: string;
  runId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
  /** Monotonic sequence number for ordering */
  seq: number;
}

export interface DurableEventLogOptions {
  /** Directory to store log files */
  logDir: string;
  /** Max events per log file before rotation */
  maxEventsPerFile?: number;
  /** Max bytes per log file before rotation */
  maxBytesPerFile?: number;
}

const DEFAULT_OPTIONS = {
  maxEventsPerFile: 10_000,
  maxBytesPerFile: 50 * 1024 * 1024, // 50MB
};

/**
 * Append-only event log that persists to disk.
 * Each event is written to a JSONL file before being acknowledged.
 * On construction, replays existing events from disk.
 */
export class DurableEventLog {
  private readonly logDir: string;
  private readonly maxEvents: number;
  private readonly maxBytes: number;
  private events: DurableEvent[] = [];
  private currentSeq = 0;
  private currentFileIndex = 0;
  private initialized = false;

  constructor(options: DurableEventLogOptions) {
    this.logDir = resolve(options.logDir);
    this.maxEvents = options.maxEventsPerFile ?? DEFAULT_OPTIONS.maxEventsPerFile;
    this.maxBytes = options.maxBytesPerFile ?? DEFAULT_OPTIONS.maxBytesPerFile;
  }

  /**
   * Initialize: ensure log directory exists and replay existing events.
   * Idempotent — safe to call multiple times.
   */
  init(): void {
    if (this.initialized) return;
    mkdirSync(this.logDir, { recursive: true });
    this.replay();
    this.initialized = true;
  }

  /**
   * Append an event. Persists to disk before returning.
   * Events are assigned a monotonic sequence number.
   */
  append(type: string, sessionId: string, payload: Record<string, unknown>, runId?: string): DurableEvent {
    this.ensureInitialized();
    const event: DurableEvent = {
      id: randomUUID(),
      type,
      sessionId,
      runId,
      payload,
      timestamp: Date.now(),
      seq: ++this.currentSeq,
    };
    this.events.push(event);
    this.flushToDisk(event);
    this.maybeRotate();
    return event;
  }

  /**
   * Get all events, optionally filtered by session or run.
   */
  getAll(filter?: { sessionId?: string; runId?: string; since?: number }): DurableEvent[] {
    this.ensureInitialized();
    let result = this.events;
    if (filter?.sessionId) {
      result = result.filter(e => e.sessionId === filter.sessionId);
    }
    if (filter?.runId) {
      result = result.filter(e => e.runId === filter.runId);
    }
    if (filter?.since !== undefined) {
      result = result.filter(e => e.seq >= filter.since!);
    }
    return [...result];
  }

  /**
   * Get events of a specific type.
   */
  getByType(type: string): DurableEvent[] {
    this.ensureInitialized();
    return this.events.filter(e => e.type === type);
  }

  /**
   * Get the highest sequence number seen.
   */
  getCurrentSeq(): number {
    return this.currentSeq;
  }

  /**
   * Get all events since a sequence number (for incremental replay).
   */
  getSince(seq: number): DurableEvent[] {
    this.ensureInitialized();
    return this.events.filter(e => e.seq > seq);
  }

  /**
   * Replay events from disk. Finds the latest log file and reads all events.
   * Recovers the currentSeq from the highest event seen.
   */
  private replay(): void {
    const files = this.getLogFiles();
    if (files.length === 0) return;

    // Find the latest file (highest index)
    const latestFile = files[files.length - 1];
    this.currentFileIndex = this.getFileIndex(latestFile);

    // Read all events from all log files in order
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as DurableEvent;
            this.events.push(event);
            if (event.seq > this.currentSeq) {
              this.currentSeq = event.seq;
            }
          } catch {
            // Skip corrupted lines — partial writes at end of file
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  /**
   * Flush a single event to the current log file.
   */
  private flushToDisk(event: DurableEvent): void {
    const file = this.getCurrentLogFile();
    const line = JSON.stringify(event) + '\n';
    appendFileSync(file, line, 'utf-8');
  }

  /**
   * Rotate log file if size or event count exceeded.
   */
  private maybeRotate(): void {
    const file = this.getCurrentLogFile();
    if (!existsSync(file)) return;

    const stat = statSync(file);
    if (stat.size >= this.maxBytes || this.events.length >= this.maxEvents) {
      this.currentFileIndex++;
    }
  }

  /**
   * Get the path to the current log file.
   */
  private getCurrentLogFile(): string {
    return resolve(this.logDir, `events-${this.currentFileIndex.toString().padStart(4, '0')}.jsonl`);
  }

  /**
   * Get all log files sorted by index.
   */
  private getLogFiles(): string[] {
    if (!existsSync(this.logDir)) return [];
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    return readdirSync(this.logDir)
      .filter((f: string) => f.startsWith('events-') && f.endsWith('.jsonl'))
      .sort()
      .map((f: string) => resolve(this.logDir, f));
  }

  /**
   * Extract the numeric index from a log filename.
   */
  private getFileIndex(filepath: string): number {
    const match = filepath.match(/events-(\d+)\.jsonl/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.init();
    }
  }
}
