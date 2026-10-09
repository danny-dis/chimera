import { EventStream } from '../event-stream.js';
import type { ChimeraEvent } from '../types/events.js';

/**
 * EventBus — wraps EventStream to provide the domain EventBus interface.
 * Decouples state change notification from the concrete EventStream implementation.
 */
export class EventBus {
  private eventStream: EventStream;

  constructor(eventStream?: EventStream) {
    this.eventStream = eventStream ?? new EventStream();
  }

  emit(event: ChimeraEvent): void {
    this.eventStream.append(event);
  }

  subscribe<T extends ChimeraEvent['type']>(
    type: T,
    listener: (event: Extract<ChimeraEvent, { type: T }>) => void,
  ): () => void {
    return this.eventStream.subscribe(type, listener as any);
  }

  getAll(): ReadonlyArray<ChimeraEvent> {
    return this.eventStream.getAll();
  }

  getByType<T extends ChimeraEvent['type']>(type: T): Array<Extract<ChimeraEvent, { type: T }>> {
    return this.eventStream.getByType(type) as any;
  }

  replay(fromIndex?: number): ChimeraEvent[] {
    return this.eventStream.replay(fromIndex);
  }

  getUnderlyingStream(): EventStream {
    return this.eventStream;
  }
}
