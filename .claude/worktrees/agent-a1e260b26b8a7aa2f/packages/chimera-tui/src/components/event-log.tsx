import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EventLogEntry } from '../types.js';

interface EventLogProps {
  events: EventLogEntry[];
  filter?: string | null;
  onFilterChange?: (type: string | null) => void;
  maxVisible?: number;
}

const eventTypeColors: Record<string, string> = {
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

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export const EventLog: React.FC<EventLogProps> = ({
  events,
  filter = null,
  onFilterChange,
  maxVisible = 20,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
      } else if (visibleEvents[selectedIndex] && onFilterChange) {
        onFilterChange(visibleEvents[selectedIndex].type);
      }
    }
  });

  const eventTypes = [...new Set(events.map((e) => e.type))];

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="white" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="white">
          Event Log
        </Text>
        <Text dimColor>
          {' '}
          ({filteredEvents.length}
          {filter ? ` filtered by ${filter}` : ''})
        </Text>
      </Box>

      {eventTypes.length > 1 && (
        <Box marginBottom={1}>
          <Text dimColor>Types: </Text>
          {eventTypes.slice(0, 5).map((type) => (
            <Box key={type} marginRight={1}>
              <Text
                color={type === filter ? 'yellow' : 'gray'}
                bold={type === filter}
              >
                {type}
              </Text>
            </Box>
          ))}
          {eventTypes.length > 5 && <Text dimColor>+{eventTypes.length - 5} more</Text>}
        </Box>
      )}

      <Box flexDirection="column">
        {visibleEvents.map((event, i) => {
          const color = eventTypeColors[event.type] ?? 'white';
          const isSelected = i === selectedIndex;
          const isCollapsed = collapsed.has(event.type);

          return (
            <Box key={event.id} flexDirection="column">
              <Box>
                <Text inverse={isSelected}>{isSelected ? '▸' : ' '}</Text>
                <Text dimColor> {formatTime(event.timestamp)} </Text>
                <Text color={color} bold={isSelected}>
                  [{event.type}]
                </Text>
                <Text> {event.message}</Text>
              </Box>
              {isSelected && !isCollapsed && event.data && (
                <Box marginLeft={6} flexDirection="column">
                  <Text dimColor>{JSON.stringify(event.data, null, 2).slice(0, 100)}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓: navigate  Enter: expand  f: filter</Text>
      </Box>
    </Box>
  );
};
