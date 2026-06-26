import { ChimeraEvent } from './types/events.js';
/**
 * Immutable, append-only event stream for all agent actions.
 * Enables replay, debugging, audit, and handoff state transfer.
 * Pattern inspired by OpenHands' event-stream architecture.
 */
export declare class EventStream {
    private events;
    private listeners;
    append(event: ChimeraEvent): void;
    getAll(): ReadonlyArray<ChimeraEvent>;
    getByType(type: ChimeraEvent['type']): ChimeraEvent[];
    replay(fromIndex?: number): ChimeraEvent[];
    subscribe(type: string, listener: (event: ChimeraEvent) => void): () => void;
    private notify;
}
//# sourceMappingURL=event-stream.d.ts.map