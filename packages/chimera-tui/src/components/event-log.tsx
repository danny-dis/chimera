import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EventLogEntry } from '../types.js';
import { Viewport } from './viewport.js';
import { formatTime } from './tui-utils.js';
import { zen } from '../theme.js';

interface EventLogProps {
  events: EventLogEntry[];
  filter?: string | null;
  onFilterChange?: (type: string | null) => void;
  focused?: boolean;
  height?: number;
}

const eventTypeColors: Record<string, string> = {
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
const renderEventSummary = (event: EventLogEntry): string => {
  const data = event.data as Record<string, unknown> | undefined;

  switch (event.type) {
    case 'tool_call_requested': {
      const call = data?.call as { tool?: string; args?: Record<string, unknown> } | undefined;
      const tool = call?.tool ?? 'unknown';
      const argsStr = call?.args ? Object.keys(call.args).join(', ') : '';
      return `Tool: ${tool}${argsStr ? ` (${argsStr})` : ''}`;
    }
    case 'tool_call_result': {
      const result = data?.result as { tool?: string; output?: string; exitCode?: number } | undefined;
      return `Tool ${result?.tool ?? '?'} completed${result?.exitCode !== undefined ? ` (exit ${result.exitCode})` : ''}`;
    }
    case 'cost_alert': {
      const pct = (data?.percentage as number) ?? 0;
      const action = data?.action as string ?? 'warn';
      return `$${(data?.currentCost as number ?? 0).toFixed(4)} / $${(data?.budget as number ?? 0).toFixed(2)} — ${Math.round(pct)}% — ${action}`;
    }
    case 'agent_spawned':
      return `${data?.role ?? '?'} on ${data?.provider ?? '?'}/${data?.model ?? '?'}`;
    case 'draft_proposed':
      return `by ${data?.agentId ?? '?'} (confidence: ${(data?.confidence as number ?? 0).toFixed(2)})`;
    case 'verified':
      return `by ${data?.agentId ?? '?'} — verdict: ${data?.verdict ?? '?'}`;
    case 'challenged':
      return `by ${data?.agentId ?? '?'} — ${(data?.challenges as string[] ?? []).length} challenges`;
    case 'context_threshold_reached':
      return `${data?.agentId ?? '?'} at ${(data?.fillPercent as number ?? 0).toFixed(0)}% fill`;
    case 'check_result':
      return `exit ${(data?.exitCode as number ?? '?')} — ${data?.command ?? '?'}`;
    default:
      return event.message;
  }
};

export const EventLog: React.FC<EventLogProps> = ({
  events,
  filter = null,
  onFilterChange,
  focused = false,
  height = 10,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filteredEvents = filter
    ? events.filter((e) => e.type === filter)
    : events;

  useInput((input, key) => {
    if (!focused) return;

    if (key.return && filteredEvents.length > 0) {
      const type = filteredEvents[filteredEvents.length - 1].type;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(type)) {
          next.delete(type);
        } else {
          next.add(type);
        }
        return next;
      });
      return;
    }

    if (input === 'f') {
      if (filter && onFilterChange) {
        onFilterChange(null);
      } else if (filteredEvents.length > 0 && onFilterChange) {
        onFilterChange(filteredEvents[filteredEvents.length - 1].type);
      }
    }
  });

  const eventTypes = [...new Set(events.map((e) => e.type))];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      height={height + 4}
    >
      <Box marginBottom={0}>
        <Text bold color={focused ? 'cyan' : 'white'}>
          Event Log
        </Text>
        <Text dimColor>
          {' '}
          ({filteredEvents.length}
          {filter ? ` filtered by ${filter}` : ''})
        </Text>
      </Box>

      {eventTypes.length > 1 && !filter && (
        <Box marginBottom={0}>
          <Text dimColor>Types: </Text>
          <Text dimColor>{eventTypes.slice(0, 5).join(', ')}{eventTypes.length > 5 ? '...' : ''}</Text>
        </Box>
      )}

      <Viewport
        items={filteredEvents}
        height={height}
        focused={focused}
        renderItem={(event, _index, isSelected) => {
          if (filteredEvents.length === 0) {
            return (
              <Box>
                <Text dimColor>No events yet. Start a task to see events.</Text>
              </Box>
            );
          }
          const color = eventTypeColors[event.type] ?? 'white';
          const isCollapsed = collapsed.has(event.type);
          const summary = renderEventSummary(event);

          return (
            <Box flexDirection="column">
              <Box>
                <Text inverse={isSelected}>{isSelected ? '▸' : ' '}</Text>
                <Text dimColor> {formatTime(event.timestamp)} </Text>
                <Text color={color} bold={isSelected}>
                  [{event.type}]
                </Text>
                <Text> {summary}</Text>
              </Box>
              {isSelected && !isCollapsed && event.data && (
                <Box marginLeft={6} flexDirection="column">
                  <Text dimColor>{JSON.stringify(event.data, null, 2).slice(0, 200)}</Text>
                </Box>
              )}
            </Box>
          );
        }}
      />

      {focused && (
        <Box marginTop={0}>
          <Text dimColor>[↑↓] nav | [Enter] expand | [f] filter</Text>
        </Box>
      )}
    </Box>
  );
};
