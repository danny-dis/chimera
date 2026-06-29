import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DeliberationMode } from '@chimera/core';
import { zen } from '../theme.js';

interface PresetSelectorProps {
  currentPreset: DeliberationMode;
  onPresetChange?: (preset: DeliberationMode) => void;
  focused?: boolean;
  compact?: boolean;
  contentWidth?: number;
}

const presets: DeliberationMode[] = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];

const presetIcons: Record<DeliberationMode, string> = {
  solo: '●',
  duo: '◉',
  trio: '◎',
  merge: '⬡',
  hive: '⬡',
  fusion: '◆',
  swarm: '🐝',
  auto: '⚡',
};

const presetDescriptions: Record<DeliberationMode, string> = {
  solo: 'Single agent',
  duo: 'Two agents',
  trio: 'Three agents',
  merge: 'Merge multiple agent outputs',
  hive: 'Decompose & parallel subtasks',
  fusion: 'Multi-model fusion',
  swarm: 'Autonomous swarm orchestration',
  auto: 'Automatic selection',
};

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  currentPreset,
  onPresetChange,
  focused = false,
  compact = false,
  contentWidth,
}) => {
  const [navIndex, setNavIndex] = useState(() => presets.indexOf(currentPreset));

  const selectPreset = useCallback((index: number) => {
    const preset = presets[index];
    if (preset && onPresetChange) {
      onPresetChange(preset);
    }
  }, [onPresetChange]);

  useInput((_input, key) => {
    if (!focused) return;

    if (key.leftArrow) {
      setNavIndex((prev) => {
        const next = Math.max(0, prev - 1);
        selectPreset(next);
        return next;
      });
      return;
    }

    if (key.rightArrow) {
      setNavIndex((prev) => {
        const next = Math.min(presets.length - 1, prev + 1);
        selectPreset(next);
        return next;
      });
      return;
    }

    if (key.return) {
      selectPreset(navIndex);
      return;
    }
  });

  if (compact) {
    return (
      <Box>
        <Text bold color={focused ? 'magenta' : 'dimColor'}>
          Preset{' '}
        </Text>
        {presets.map((preset) => (
          <Box key={preset} marginRight={1}>
            <Text
              color={preset === currentPreset ? 'magenta' : zen.muted}
              bold={preset === currentPreset}
              underline={preset === currentPreset}
            >
              {presetIcons[preset]} {preset}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">Preset</Text>
      {presets.map((preset) => {
        const isSelected = preset === currentPreset;
        return (
          <Box key={preset}>
            <Text color={isSelected ? 'magenta' : zen.muted}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text
              bold={isSelected}
              color={isSelected ? 'magenta' : zen.fg}
            >
              {presetIcons[preset]} {preset}
            </Text>
            <Text dimColor>{(!contentWidth || contentWidth >= 35) ? ` — ${presetDescriptions[preset].slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : ''}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
