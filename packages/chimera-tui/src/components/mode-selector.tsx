import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Mode } from '@chimera/core';
import { zen } from '../theme.js';

interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange?: (mode: Mode) => void;
  focused?: boolean;
  compact?: boolean;
}

const modes: Mode[] = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];

const modeIcons: Record<Mode, string> = {
  ask: '?',
  plan: '◈',
  code: '⚡',
  debug: '◉',
  review: '◎',
  oal: '◆',
  auto: '⟳',
};

const modeDescriptions: Record<Mode, string> = {
  ask: 'Quick Q&A',
  plan: 'Plan changes',
  code: 'Write code',
  debug: 'Debug issues',
  review: 'Review code',
  oal: 'OAL mode',
  auto: 'Auto-select mode',
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
  focused = false,
  compact = false,
}) => {
  const [navIndex, setNavIndex] = useState(() => modes.indexOf(currentMode));

  const selectMode = useCallback((index: number) => {
    const mode = modes[index];
    if (mode && onModeChange) {
      onModeChange(mode);
    }
  }, [onModeChange]);

  useInput((_input, key) => {
    if (!focused) return;

    if (key.leftArrow) {
      setNavIndex((prev) => {
        const next = Math.max(0, prev - 1);
        selectMode(next);
        return next;
      });
      return;
    }

    if (key.rightArrow) {
      setNavIndex((prev) => {
        const next = Math.min(modes.length - 1, prev + 1);
        selectMode(next);
        return next;
      });
      return;
    }

    if (key.return) {
      selectMode(navIndex);
      return;
    }
  });

  if (compact) {
    return (
      <Box>
        <Text bold color={focused ? zen.accent : 'dimColor'}>
          Mode{' '}
        </Text>
        {modes.map((mode) => (
          <Box key={mode} marginRight={1}>
            <Text
              color={mode === currentMode ? zen.accent : zen.muted}
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
    <Box flexDirection="column" borderStyle="single" borderColor={zen.accent} paddingX={1}>
      <Text bold color={zen.accent}>Mode</Text>
      {modes.map((mode) => {
        const isSelected = mode === currentMode;
        return (
          <Box key={mode}>
            <Text color={isSelected ? zen.accent : zen.muted}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text
              bold={isSelected}
              color={isSelected ? zen.accent : zen.fg}
            >
              {modeIcons[mode]} {mode}
            </Text>
            <Text dimColor> — {modeDescriptions[mode]}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
