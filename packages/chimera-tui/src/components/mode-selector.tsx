import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Mode } from '@chimera/core';
import { zen, MODES, MODE_META, tiered } from '../theme.js';
import type { SkillModelView } from '../types.js';

interface ModeSelectorProps {
  mode: Mode;
  onSelect?: (mode: Mode) => void;
  focused?: boolean;
  compact?: boolean;
  contentWidth?: number;
  skillModel?: SkillModelView;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  onSelect,
  focused = false,
  compact = false,
  contentWidth,
  skillModel,
}) => {
  const [navIndex, setNavIndex] = useState(() => Math.max(0, MODES.indexOf(mode)));

  const selectMode = useCallback((index: number) => {
    const m = MODES[index];
    if (m && onSelect) onSelect(m);
  }, [onSelect]);

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
        const next = Math.min(MODES.length - 1, prev + 1);
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
      <Box flexWrap="wrap">
        {MODES.map((m) => {
          const sel = m === mode;
          return (
            <Box key={m} marginRight={1}>
              <Text
                color={sel ? zen.accent : zen.muted}
                bold={sel}
                underline={sel}
              >
                {MODE_META[m].icon} {m}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={zen.accent} paddingX={1}>
      <Text bold color={zen.accent}>Mode</Text>
      {MODES.map((m) => {
        const isSelected = m === mode;
        return (
          <Box key={m}>
            <Text color={isSelected ? zen.accent : zen.muted}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text bold={isSelected} color={isSelected ? zen.accent : zen.fg}>
              {MODE_META[m].icon} {m}
            </Text>
            <Text dimColor>{(!contentWidth || contentWidth >= 35) ? ` — ${tiered(MODE_META[m].desc, skillModel).slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : ''}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
