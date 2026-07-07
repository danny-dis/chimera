import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DeliberationMode } from '@chimera/core';
import { zen, PRESETS, PRESET_META } from '../theme.js';

interface PresetSelectorProps {
  preset: DeliberationMode;
  onSelect?: (preset: DeliberationMode) => void;
  focused?: boolean;
  compact?: boolean;
  contentWidth?: number;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  preset,
  onSelect,
  focused = false,
  compact = false,
  contentWidth,
}) => {
  const [navIndex, setNavIndex] = useState(() => Math.max(0, PRESETS.indexOf(preset)));

  const selectPreset = useCallback((index: number) => {
    const p = PRESETS[index];
    if (p && onSelect) onSelect(p);
  }, [onSelect]);

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
        const next = Math.min(PRESETS.length - 1, prev + 1);
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
      <Box flexWrap="wrap">
        {PRESETS.map((p) => {
          const sel = p === preset;
          return (
            <Box key={p} marginRight={1}>
              <Text
                color={sel ? zen.agent : zen.muted}
                bold={sel}
                underline={sel}
              >
                {PRESET_META[p].icon} {p}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={zen.agent} paddingX={1}>
      <Text bold color={zen.agent}>Preset</Text>
      {PRESETS.map((p) => {
        const isSelected = p === preset;
        return (
          <Box key={p}>
            <Text color={isSelected ? zen.agent : zen.muted}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text bold={isSelected} color={isSelected ? zen.agent : zen.fg}>
              {PRESET_META[p].icon} {p}
            </Text>
            <Text dimColor>{(!contentWidth || contentWidth >= 35) ? ` — ${PRESET_META[p].description.slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : ''}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
