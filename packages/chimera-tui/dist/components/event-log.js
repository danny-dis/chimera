import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Viewport } from './viewport.js';
import { formatTime } from './tui-utils.js';
import { zen } from '../theme.js';
const eventTypeColors = {
    user_request: zen.accent,
    task_classified: zen.info,
    task_decomposed: zen.info,
    agent_spawned: 'magenta',
    context_pack_created: zen.fg,
    draft_proposed: zen.success,
    verified: zen.success,
    challenged: zen.warning,
    disagreement_detected: zen.error,
    handoff_triggered: zen.warning,
    handoff_validated: zen.success,
    tool_call_requested: zen.warning,
    tool_call_result: zen.success,
    patch_proposed: 'magenta',
    check_result: zen.success,
    review_finding: zen.warning,
    cost_alert: zen.error,
    context_threshold_reached: zen.warning,
    session_compacted: zen.fg,
    quality_gate_parallel_started: zen.accent,
    quality_gate_parallel_completed: zen.success,
    final_response: zen.success,
    provenance_claim: zen.fg,
    error: zen.error,
};
/** Render a human-friendly summary for a specific event type. */
const renderEventSummary = (event) => {
    const data = event.data;
    switch (event.type) {
        case 'tool_call_requested': {
            const call = data?.call;
            const tool = call?.tool ?? 'unknown';
            const argsStr = call?.args ? Object.keys(call.args).join(', ') : '';
            return `Tool: ${tool}${argsStr ? ` (${argsStr})` : ''}`;
        }
        case 'tool_call_result': {
            const result = data?.result;
            return `Tool ${result?.tool ?? '?'} completed${result?.exitCode !== undefined ? ` (exit ${result.exitCode})` : ''}`;
        }
        case 'cost_alert': {
            const pct = data?.percentage ?? 0;
            const action = data?.action ?? 'warn';
            return `$${(data?.currentCost ?? 0).toFixed(4)} / $${(data?.budget ?? 0).toFixed(2)} — ${Math.round(pct)}% — ${action}`;
        }
        case 'agent_spawned':
            return `${data?.role ?? '?'} on ${data?.provider ?? '?'}/${data?.model ?? '?'}`;
        case 'draft_proposed':
            return `by ${data?.agentId ?? '?'} (confidence: ${(data?.confidence ?? 0).toFixed(2)})`;
        case 'verified':
            return `by ${data?.agentId ?? '?'} — verdict: ${data?.verdict ?? '?'}`;
        case 'challenged':
            return `by ${data?.agentId ?? '?'} — ${(data?.challenges ?? []).length} challenges`;
        case 'context_threshold_reached':
            return `${data?.agentId ?? '?'} at ${(data?.fillPercent ?? 0).toFixed(0)}% fill`;
        case 'check_result':
            return `exit ${(data?.exitCode ?? '?')} — ${data?.command ?? '?'}`;
        default:
            return event.message;
    }
};
export const EventLog = ({ events, filter = null, onFilterChange, focused = false, height = 10, contentWidth, }) => {
    const [collapsed, setCollapsed] = useState(new Set());
    const filteredEvents = filter
        ? events.filter((e) => e.type === filter)
        : events;
    useInput((input, key) => {
        if (!focused)
            return;
        if (key.return && filteredEvents.length > 0) {
            const type = filteredEvents[filteredEvents.length - 1].type;
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
            else if (filteredEvents.length > 0 && onFilterChange) {
                onFilterChange(filteredEvents[filteredEvents.length - 1].type);
            }
        }
    });
    const eventTypes = [...new Set(events.map((e) => e.type))];
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: focused ? 'cyan' : 'gray', paddingX: 1, height: height + 4 },
        React.createElement(Box, { marginBottom: 0 },
            React.createElement(Text, { bold: true, color: focused ? 'cyan' : 'white' }, contentWidth && contentWidth < 25 ? 'Events' : 'Event Log'),
            React.createElement(Text, { dimColor: true },
                ' ',
                "(",
                filteredEvents.length,
                filter && contentWidth && contentWidth >= 25 ? ` filtered by ${filter}` : '',
                ")")),
        eventTypes.length > 1 && !filter && (React.createElement(Box, { marginBottom: 0 },
            React.createElement(Text, { dimColor: true }, "Types: "),
            React.createElement(Text, { dimColor: true }, contentWidth && contentWidth < 35
                ? eventTypes.slice(0, 2).join(', ') + (eventTypes.length > 2 ? '…' : '')
                : eventTypes.slice(0, 5).join(', ') + (eventTypes.length > 5 ? '...' : '')))),
        React.createElement(Viewport, { items: filteredEvents, height: height, focused: focused, renderItem: (event, _index, isSelected) => {
                if (filteredEvents.length === 0) {
                    return (React.createElement(Box, null,
                        React.createElement(Text, { dimColor: true }, "No events yet. Start a task to see events.")));
                }
                const color = eventTypeColors[event.type] ?? 'white';
                const isCollapsed = collapsed.has(event.type);
                const summary = renderEventSummary(event);
                const isNarrow = contentWidth !== undefined && contentWidth < 30;
                return (React.createElement(Box, { flexDirection: "column" },
                    React.createElement(Box, null,
                        React.createElement(Text, { inverse: isSelected }, isSelected ? '▸' : ' '),
                        !isNarrow && React.createElement(Text, { dimColor: true },
                            " ",
                            formatTime(event.timestamp),
                            " "),
                        React.createElement(Text, { color: color, bold: isSelected },
                            "[",
                            isNarrow ? event.type.slice(0, 8) : event.type,
                            "]"),
                        !isNarrow && React.createElement(Text, null,
                            " ",
                            summary)),
                    isSelected && !isCollapsed && event.data && (React.createElement(Box, { marginLeft: 6, flexDirection: "column" },
                        React.createElement(Text, { dimColor: true }, JSON.stringify(event.data, null, 2).slice(0, 200))))));
            } }),
        focused && (React.createElement(Box, { marginTop: 0 },
            React.createElement(Text, { dimColor: true }, "[\u2191\u2193] nav | [Enter] expand | [f] filter")))));
};
//# sourceMappingURL=event-log.js.map