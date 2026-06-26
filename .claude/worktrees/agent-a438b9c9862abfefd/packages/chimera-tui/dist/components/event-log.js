import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
const eventTypeColors = {
    user_request: 'cyan',
    task_classified: 'blue',
    task_decomposed: 'blue',
    agent_spawned: 'magenta',
    context_pack_created: 'white',
    draft_proposed: 'green',
    verified: 'green',
    challenged: 'yellow',
    disagreement_detected: 'red',
    handoff_triggered: 'yellow',
    handoff_validated: 'green',
    tool_call_requested: 'yellow',
    tool_call_result: 'green',
    patch_proposed: 'magenta',
    check_result: 'green',
    review_finding: 'yellow',
    cost_alert: 'red',
    context_threshold_reached: 'yellow',
    session_compacted: 'white',
    quality_gate_parallel_started: 'cyan',
    quality_gate_parallel_completed: 'green',
    final_response: 'green',
    provenance_claim: 'white',
};
const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
};
export const EventLog = ({ events, filter = null, onFilterChange, maxVisible = 20, }) => {
    const [collapsed, setCollapsed] = useState(new Set());
    const [selectedIndex, setSelectedIndex] = useState(0);
    const filteredEvents = filter
        ? events.filter((e) => e.type === filter)
        : events;
    const visibleEvents = filteredEvents.slice(-maxVisible);
    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(visibleEvents.length - 1, prev + 1));
            return;
        }
        if (key.return && visibleEvents[selectedIndex]) {
            const type = visibleEvents[selectedIndex].type;
            setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(type)) {
                    next.delete(type);
                }
                else {
                    next.add(type);
                }
                return next;
            });
            return;
        }
        if (input === 'f') {
            if (filter && onFilterChange) {
                onFilterChange(null);
            }
            else if (visibleEvents[selectedIndex] && onFilterChange) {
                onFilterChange(visibleEvents[selectedIndex].type);
            }
        }
    });
    const eventTypes = [...new Set(events.map((e) => e.type))];
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: "white", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "white" }, "Event Log"),
            React.createElement(Text, { dimColor: true },
                ' ',
                "(",
                filteredEvents.length,
                filter ? ` filtered by ${filter}` : '',
                ")")),
        eventTypes.length > 1 && (React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { dimColor: true }, "Types: "),
            eventTypes.slice(0, 5).map((type) => (React.createElement(Box, { key: type, marginRight: 1 },
                React.createElement(Text, { color: type === filter ? 'yellow' : 'gray', bold: type === filter }, type)))),
            eventTypes.length > 5 && React.createElement(Text, { dimColor: true },
                "+",
                eventTypes.length - 5,
                " more"))),
        React.createElement(Box, { flexDirection: "column" }, visibleEvents.map((event, i) => {
            const color = eventTypeColors[event.type] ?? 'white';
            const isSelected = i === selectedIndex;
            const isCollapsed = collapsed.has(event.type);
            return (React.createElement(Box, { key: event.id, flexDirection: "column" },
                React.createElement(Box, null,
                    React.createElement(Text, { inverse: isSelected }, isSelected ? '▸' : ' '),
                    React.createElement(Text, { dimColor: true },
                        " ",
                        formatTime(event.timestamp),
                        " "),
                    React.createElement(Text, { color: color, bold: isSelected },
                        "[",
                        event.type,
                        "]"),
                    React.createElement(Text, null,
                        " ",
                        event.message)),
                isSelected && !isCollapsed && event.data && (React.createElement(Box, { marginLeft: 6, flexDirection: "column" },
                    React.createElement(Text, { dimColor: true }, JSON.stringify(event.data, null, 2).slice(0, 100))))));
        })),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, "\u2191\u2193: navigate  Enter: expand  f: filter"))));
};
//# sourceMappingURL=event-log.js.map