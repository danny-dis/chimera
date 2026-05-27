import { ChimeraEvent } from './types/events.js';

/**
 * Immutable, append-only event stream for all agent actions.
 * Enables replay, debugging, audit, and handoff state transfer.
 * Pattern inspired by OpenHands' event-stream architecture.
 */
export class EventStream {
  private events: ChimeraEvent[] = [];
  private listeners: Map<string, (event: ChimeraEvent) => void> = new Map();

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
    this.listeners.set(`${type}:${listener.name}`, listener);
    return () => this.listeners.delete(`${type}:${listener.name}`);
  }

  private notify(event: ChimeraEvent): void {
    for (const [key, listener] of this.listeners) {
      const [eventType] = key.split(':');
      if (eventType === event.type || eventType === '*') {
        listener(event);
      }
    }
  }
}
