import React from 'react';
import { Box, Text } from 'ink';
import { zen, hierarchy, SPACING } from '../theme.js';

interface EmptyStateProps {
  /** Single glyph shown above the message — keep it terminal-safe. */
  icon?: string;
  /** Short label rendered next to/above the icon (e.g. "No events yet"). */
  title?: string;
  /** Body copy — usually a `tiered()` string. */
  message: string;
  color?: string;
}

/**
 * Shared "nothing here yet" treatment so every panel (chat, events, diff,
 * sessions, agents) reads as intentionally designed rather than a bare
 * `<Text dimColor>` fallback. Icon + title anchor the eye; the message
 * carries the tiered, adaptive copy.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '○', title, message, color = zen.muted }) => (
  <Box flexDirection="column" paddingX={SPACING.sm} paddingY={SPACING.sm}>
    <Box>
      <Text color={color}>{icon} </Text>
      {title ? <Text {...hierarchy.secondary} color={color}>{title}</Text> : null}
    </Box>
    <Box marginLeft={2}>
      <Text {...hierarchy.tertiary}>{message}</Text>
    </Box>
  </Box>
);
