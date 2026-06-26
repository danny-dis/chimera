import React from 'react';
import { Box, Text } from 'ink';
import type { Mode } from '@chimera/core';

interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange?: (mode: Mode) => void;
  compact?: boolean;
}

const modes: Mode[] = ['ask', 'plan', 'code', 'debug', 'review'];

const modeIcons: Record<Mode, string> = {
  ask: '?',
  plan: '◈',
  code: '⚡',
  debug: '◉',
  review: '◎',
  oal: '◆',
};

const modeDescriptions: Record<Mode, string> = {
  ask: 'Quick Q&A',
  plan: 'Plan changes',
  code: 'Write code',
  debug: 'Debug issues',
  review: 'Review code',
  oal: 'OAL mode',
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange: _onModeChange,
  compact = false,
}) => {
  if (compact) {
    return (
      <Box>
        {modes.map((mode) => (
          <Box key={mode} marginRight={1}>
            <Text
              color={mode === currentMode ? 'cyan' : 'gray'}
              bold={mode === currentMode}
              underline={mode === currentMode}
            >
              {modeIcons[mode]} {mode}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Mode
        </Text>
      </Box>
      <Box flexDirection="column">
        {modes.map((mode) => {
          const isSelected = mode === currentMode;
          return (
            <Box key={mode}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text
                bold={isSelected}
                color={isSelected ? 'cyan' : 'white'}
              >
                {modeIcons[mode]} {mode}
              </Text>
              <Text dimColor> — {modeDescriptions[mode]}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
