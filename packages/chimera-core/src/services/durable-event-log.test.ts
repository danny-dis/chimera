import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DurableEventLog } from './durable-event-log.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('DurableEventLog', () => {
  let logDir: string;
  let log: DurableEventLog;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), 'durable-event-log-'));
    log = new DurableEventLog({ logDir });
    log.init();
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it('appends and retrieves events', () => {
    log.append('test_event', 'session-1', { foo: 'bar' }, 'run-1');
    const events = log.getAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('test_event');
    expect(events[0].sessionId).toBe('session-1');
    expect(events[0].runId).toBe('run-1');
    expect(events[0].payload).toEqual({ foo: 'bar' });
  });

  it('assigns monotonic sequence numbers', () => {
    const e1 = log.append('event_1', 's1', {});
    const e2 = log.append('event_2', 's1', {});
    const e3 = log.append('event_3', 's1', {});
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
  });

  it('filters by sessionId', () => {
    log.append('event', 'session-1', { a: 1 });
    log.append('event', 'session-2', { b: 2 });
    log.append('event', 'session-1', { c: 3 });
    expect(log.getAll({ sessionId: 'session-1' })).toHaveLength(2);
    expect(log.getAll({ sessionId: 'session-2' })).toHaveLength(1);
  });

  it('filters by runId', () => {
    log.append('event', 's1', {}, 'run-1');
    log.append('event', 's1', {}, 'run-2');
    log.append('event', 's1', {}, 'run-1');
    expect(log.getAll({ runId: 'run-1' })).toHaveLength(2);
    expect(log.getAll({ runId: 'run-2' })).toHaveLength(1);
  });

  it('filters by sequence number (since)', () => {
    log.append('event', 's1', { n: 1 });
    log.append('event', 's1', { n: 2 });
    log.append('event', 's1', { n: 3 });
    const since = log.getSince(1);
    expect(since).toHaveLength(2);
    expect(since[0].payload).toEqual({ n: 2 });
    expect(since[1].payload).toEqual({ n: 3 });
  });

  it('replays events from disk on construction', () => {
    log.append('event', 's1', { data: 'hello' });
    log.append('event', 's2', { data: 'world' });

    // Create a new instance pointing at the same dir
    const log2 = new DurableEventLog({ logDir });
    log2.init();
    expect(log2.getAll()).toHaveLength(2);
    expect(log2.getCurrentSeq()).toBe(2);
  });

  it('persists events to disk', () => {
    log.append('event', 's1', { persisted: true });
    const files = require('node:fs').readdirSync(logDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^events-.*\.jsonl$/);
  });

  it('rotates log files when max events exceeded', () => {
    const smallLog = new DurableEventLog({ logDir, maxEventsPerFile: 2 });
    smallLog.init();
    smallLog.append('e1', 's1', {});
    smallLog.append('e2', 's1', {});
    smallLog.append('e3', 's1', {}); // triggers rotation
    const files = require('node:fs').readdirSync(logDir);
    expect(files.length).toBe(2);
  });
});
