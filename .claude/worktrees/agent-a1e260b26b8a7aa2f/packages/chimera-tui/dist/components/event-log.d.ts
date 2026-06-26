import React from 'react';
import type { EventLogEntry } from '../types.js';
interface EventLogProps {
    events: EventLogEntry[];
    filter?: string | null;
    onFilterChange?: (type: string | null) => void;
    maxVisible?: number;
}
export declare const EventLog: React.FC<EventLogProps>;
export {};
//# sourceMappingURL=event-log.d.ts.map