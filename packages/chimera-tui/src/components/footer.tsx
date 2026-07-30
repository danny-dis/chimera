import React from 'react';
import { Box, Text } from 'ink';
import { zen, hierarchy } from '../theme.js';
import type { SkillModelView } from '../types.js';

interface FooterHint {
  combo: string;
  label: string;
  /** Lower = kept longer as width shrinks. */
  weight: number;
}

// Declared in display order; `selectFooterHints` filters by weight/width
// but preserves this left-to-right ordering for whatever survives.
const FOOTER_HINTS: FooterHint[] = [
  { combo: 'Ctrl+B', label: 'Sidebar', weight: 1 },
  { combo: 'Ctrl+C', label: 'Exit', weight: 1 },
  { combo: 'Tab', label: 'Focus', weight: 2 },
  { combo: '/help', label: '', weight: 2 },
  { combo: 'Esc', label: 'Close', weight: 3 },
  { combo: '/agents /events /diff', label: '', weight: 4 },
  { combo: 'm/l', label: 'Detail (Tab first)', weight: 5 },
];

function hintText(h: FooterHint): string {
  return h.label ? `${h.combo} ${h.label}` : h.combo;
}

/**
 * Pick as many hints as fit `width`, most important first, so the footer
 * degrades gracefully instead of wrapping into a jumbled second line.
 * Exported for unit testing.
 */
export function selectFooterHints(width: number): FooterHint[] {
  const budget = Math.max(0, width - 4);
  const separator = 3; // ' · '
  const byWeight = [...FOOTER_HINTS].sort((a, b) => a.weight - b.weight);

  const chosen = new Set<FooterHint>();
  let used = 0;
  for (const hint of byWeight) {
    const text = hintText(hint);
    const cost = chosen.size === 0 ? text.length : text.length + separator;
    if (used + cost <= budget) {
      chosen.add(hint);
      used += cost;
    }
  }

  // Never render nothing — always fall back to the single most useful hint.
  if (chosen.size === 0) chosen.add(FOOTER_HINTS.find((h) => h.combo === '/help')!);

  return FOOTER_HINTS.filter((h) => chosen.has(h));
}

interface FooterProps {
  width: number;
  sessionId: string;
  skillModel?: SkillModelView;
}

export const Footer: React.FC<FooterProps> = ({ width, sessionId, skillModel }) => {
  const hints = selectFooterHints(width);
  const showSession = width >= 60;
  const showDevInfo = showSession && width >= 100 && Boolean(process.env.CHIMERA_DEV) && Boolean(skillModel);

  return (
    <Box
      borderStyle="round"
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={zen.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text {...hierarchy.tertiary}>
        {hints.map((h, i) => (
          <React.Fragment key={h.combo}>
            {i > 0 && ' · '}
            <Text color={zen.accent}>{h.combo}</Text>
            {h.label ? ` ${h.label}` : ''}
          </React.Fragment>
        ))}
      </Text>
      {showSession && (
        <Text {...hierarchy.tertiary}>
          {showDevInfo && skillModel
            ? `${sessionId} · ${skillModel.tier()} (${skillModel.tierReason()})`
            : sessionId}
        </Text>
      )}
    </Box>
  );
};
