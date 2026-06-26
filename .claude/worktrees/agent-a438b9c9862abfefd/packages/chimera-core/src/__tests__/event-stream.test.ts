import { describe, it, expect, vi } from 'vitest';
import { EventStream } from '../event-stream.js';
import type { ChimeraEvent } from '../types/events.js';

function makeEvent(type: string, extra: Record<string, unknown> = {}): ChimeraEvent {
  return { type, ...extra } as unknown as ChimeraEvent;
}

describe('EventStream', () => {
  it('appends events and retrieves them via getAll', () => {
    const stream = new EventStream();
    const e1 = makeEvent('user_request', { text: 'hello', mode: 'ask' });
    const e2 = makeEvent('task_classified', { complexity: { score: 0.5, dimensions: {} }, estimatedCost: 2.5 });

    stream.append(e1);
    stream.append(e2);

    const all = stream.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]).toBe(e1);
    expect(all[1]).toBe(e2);
  });

  it('getAll returns a readonly array', () => {
    const stream = new EventStream();
    stream.append(makeEvent('user_request', { text: 'hi', mode: 'code' }));
    const all = stream.getAll();
    expect(Array.isArray(all)).toBe(true);
  });

  it('filters events by type with getByType', () => {
    const stream = new EventStream();
    stream.append(makeEvent('user_request', { text: 'a', mode: 'ask' }));
    stream.append(makeEvent('draft_proposed', { agentId: 'a1', patchId: 'p1', confidence: 0.9 }));
    stream.append(makeEvent('user_request', { text: 'b', mode: 'code' }));

    const userRequests = stream.getByType('user_request');
    expect(userRequests).toHaveLength(2);
    expect(userRequests.every((e) => e.type === 'user_request')).toBe(true);
  });

  it('getByType returns empty array for non-existent type', () => {
    const stream = new EventStream();
    stream.append(makeEvent('user_request', { text: 'x', mode: 'ask' }));
    expect(stream.getByType('cost_alert' as ChimeraEvent['type'])).toEqual([]);
  });

  it('replay returns events from a given index', () => {
    const stream = new EventStream();
    const e1 = makeEvent('user_request', { text: '1', mode: 'ask' });
    const e2 = makeEvent('user_request', { text: '2', mode: 'ask' });
    const e3 = makeEvent('user_request', { text: '3', mode: 'ask' });

    stream.append(e1);
    stream.append(e2);
    stream.append(e3);

    expect(stream.replay(0)).toHaveLength(3);
    expect(stream.replay(1)).toHaveLength(2);
    expect(stream.replay(1)[0]).toBe(e2);
    expect(stream.replay(3)).toHaveLength(0);
  });

  it('replay defaults to fromIndex=0', () => {
    const stream = new EventStream();
    stream.append(makeEvent('user_request', { text: 'a', mode: 'ask' }));
    expect(stream.replay()).toHaveLength(1);
  });

  it('subscribe notifies listener for matching event type', () => {
    const stream = new EventStream();
    const listener = vi.fn();
    stream.subscribe('user_request', listener);

    const event = makeEvent('user_request', { text: 'test', mode: 'ask' });
    stream.append(event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('subscribe does not notify for non-matching type', () => {
    const stream = new EventStream();
    const listener = vi.fn();
    stream.subscribe('user_request', listener);

    stream.append(makeEvent('draft_proposed', { agentId: 'a1', patchId: 'p1', confidence: 0.9 }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe with wildcard * receives all events', () => {
    const stream = new EventStream();
    const listener = vi.fn();
    stream.subscribe('*', listener);

    stream.append(makeEvent('user_request', { text: 'a', mode: 'ask' }));
    stream.append(makeEvent('draft_proposed', { agentId: 'a1', patchId: 'p1', confidence: 0.9 }));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const stream = new EventStream();
    const listener = vi.fn();
    const unsub = stream.subscribe('user_request', listener);

    stream.append(makeEvent('user_request', { text: 'a', mode: 'ask' }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    stream.append(makeEvent('user_request', { text: 'b', mode: 'ask' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple listeners for the same type', () => {
    const stream = new EventStream();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    stream.subscribe('user_request', listener1);
    stream.subscribe('user_request', listener2);

    const event = makeEvent('user_request', { text: 'x', mode: 'ask' });
    stream.append(event);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('notifies all matching listeners across types', () => {
    const stream = new EventStream();
    const wildcard = vi.fn();
    const specific = vi.fn();

    stream.subscribe('*', wildcard);
    stream.subscribe('user_request', specific);

    stream.append(makeEvent('user_request', { text: 'x', mode: 'ask' }));
    expect(wildcard).toHaveBeenCalledTimes(1);
    expect(specific).toHaveBeenCalledTimes(1);
  });

  it('handles empty stream', () => {
    const stream = new EventStream();
    expect(stream.getAll()).toHaveLength(0);
    expect(stream.replay()).toHaveLength(0);
    expect(stream.getByType('user_request')).toHaveLength(0);
  });
});
