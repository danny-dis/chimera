"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStream = void 0;
/**
 * Immutable, append-only event stream for all agent actions.
 * Enables replay, debugging, audit, and handoff state transfer.
 * Pattern inspired by OpenHands' event-stream architecture.
 */
class EventStream {
    events = [];
    listeners = new Map();
    append(event) {
        this.events.push(event);
        this.notify(event);
    }
    getAll() {
        return this.events;
    }
    getByType(type) {
        return this.events.filter((e) => e.type === type);
    }
    replay(fromIndex = 0) {
        return this.events.slice(fromIndex);
    }
    subscribe(type, listener) {
        this.listeners.set(`${type}:${listener.name}`, listener);
        return () => this.listeners.delete(`${type}:${listener.name}`);
    }
    notify(event) {
        for (const [key, listener] of this.listeners) {
            const [eventType] = key.split(':');
            if (eventType === event.type || eventType === '*') {
                listener(event);
            }
        }
    }
}
exports.EventStream = EventStream;
//# sourceMappingURL=event-stream.js.map