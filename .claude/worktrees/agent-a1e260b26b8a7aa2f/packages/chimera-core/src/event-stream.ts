import { ChimeraEvent } from './types/events.js';

/**
 * Immutable, append-only event stream for all agent actions.
 * Enables replay, debugging, audit, and handoff state transfer.
 * Pattern inspired by OpenHands' event-stream architecture.
 */
export class EventStream {
  private events: ChimeraEvent[] = [];
  // One Set of listeners per event type. '*' is the wildcard subscription.
  private listeners: Map<string, Set<(event: ChimeraEvent) => void>> = new Map();

  append(event: ChimeraEvent): void {
    this.events.push(event);
    this.notify(event);
  }

  getAll(): ReadonlyArray<ChimeraEvent> {
    return this.events;
  }

  getByType(type: ChimeraEvent['type']): ChimeraEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  replay(fromIndex: number = 0): ChimeraEvent[] {
    return this.events.slice(fromIndex);
  }

  subscribe(type: string, listener: (event: ChimeraEvent) => void): () => void {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener);
    return () => {
      bucket?.delete(listener);
    };
  }

  private notify(event: ChimeraEvent): void {
    const exact = this.listeners.get(event.type);
    if (exact) {
      for (const listener of exact) {
        listener(event);
      }
    }
    const wildcards = this.listeners.get('*');
    if (wildcards) {
      for (const listener of wildcards) {
        listener(event);
      }
    }
  }
}
