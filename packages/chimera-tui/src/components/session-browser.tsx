import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Session, SkillModelView } from '../types.js';
import { zen, hierarchy, tiered, PANEL_BORDER } from '../theme.js';
import { formatCost, formatDateTime } from './tui-utils.js';
import { EmptyState } from './empty-state.js';

interface SessionBrowserProps {
  sessions: Session[];
  onSelect?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  skillModel?: SkillModelView;
}

export const SessionBrowser: React.FC<SessionBrowserProps> = ({
  sessions,
  onSelect,
  onDelete,
  skillModel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
      return;
    }

    if (key.return && sessions[selectedIndex]) {
      if (confirmDelete === sessions[selectedIndex].id) {
        onDelete?.(sessions[selectedIndex].id);
        setConfirmDelete(null);
      } else {
        onSelect?.(sessions[selectedIndex].id);
      }
      return;
    }

    if (input === 'd' && sessions[selectedIndex]) {
      if (confirmDelete === sessions[selectedIndex].id) {
        onDelete?.(sessions[selectedIndex].id);
        setConfirmDelete(null);
      } else {
        setConfirmDelete(sessions[selectedIndex].id);
      }
      return;
    }

    if (key.escape) {
      setConfirmDelete(null);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={PANEL_BORDER} borderColor={zen.borderActive} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={zen.agent}>
          Sessions
        </Text>
        <Text {...hierarchy.tertiary}> ({sessions.length})</Text>
      </Box>

      {sessions.length === 0 && (
        <EmptyState
          icon="○"
          message={tiered({
            beginner: 'No saved sessions yet — each conversation is saved automatically, so your past sessions will appear here to reopen or resume.',
            intermediate: 'No saved sessions',
            advanced: 'No saved sessions.',
          }, skillModel)}
        />
      )}

      {sessions.map((session, i) => {
        const isSelected = i === selectedIndex;
        const isConfirming = confirmDelete === session.id;

        return (
          <Box key={session.id} flexDirection="column">
            <Box>
              <Text inverse={isSelected}>{isSelected ? '▸ ' : '  '}</Text>
              <Text bold={isSelected}>{formatDateTime(session.date)}</Text>
              <Text {...hierarchy.tertiary}> </Text>
              <Text {...hierarchy.secondary}>{session.taskSummary.slice(0, 40)}</Text>
              <Text {...hierarchy.tertiary}> </Text>
              <Text color={zen.success}>{formatCost(session.cost)}</Text>
              <Text {...hierarchy.tertiary}>
                {' '}
                {session.messageCount}msg {session.agentCount}agents
              </Text>
            </Box>
            {isSelected && isConfirming && (
              <Box marginLeft={4}>
                <Text color={zen.error}>Press Enter to delete, Esc to cancel</Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text {...hierarchy.tertiary}>[↑↓] navigate  [Enter] select  [d] delete</Text>
      </Box>
    </Box>
  );
};
