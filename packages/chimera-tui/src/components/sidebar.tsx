import React from 'react';
import { Box, Text } from 'ink';
import type { Mode, DeliberationMode } from '@chimera/core';
import type { Agent, CostData } from '../types.js';
import { zen } from '../theme.js';
import { formatCost, statusSymbols } from './tui-utils.js';

interface SidebarProps {
  sessionId: string;
  mode: Mode;
  preset: DeliberationMode;
  agents: Agent[];
  costData: CostData;
  tokenUsage?: { input: number; output: number; total: number };
  workingDir?: string;
  instructions?: string[];
  contentWidth?: number;
  onModeChange?: (mode: Mode) => void;
  onPresetChange?: (preset: DeliberationMode) => void;
}

const modes: Mode[] = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];
const presets: DeliberationMode[] = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];

const modeIcons: Record<Mode, string> = {
  ask: '?', plan: '◈', code: '⚡', debug: '◉', review: '◎', oal: '◆', auto: '⟳',
};

const presetIcons: Record<DeliberationMode, string> = {
  solo: '●', duo: '◉', trio: '◎', merge: '⬡', hive: '⬡', fusion: '◆', swarm: '🐝', auto: '⚡',
};

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({
  label, color = zen.fg, children,
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold color={color}>{label}</Text>
    {children}
  </Box>
);

export const Sidebar: React.FC<SidebarProps> = ({
  sessionId,
  mode,
  preset,
  agents,
  costData,
  tokenUsage,
  workingDir,
  instructions,
  contentWidth,
}) => {
  const totalTokens = tokenUsage?.total
    ?? agents.reduce((sum, a) => sum + a.tokenUsage.input + a.tokenUsage.output, 0);
  const usagePercent = costData.budget > 0
    ? Math.round((costData.currentCost / costData.budget) * 100)
    : 0;

  const truncate = (s: string, max: number) =>
    contentWidth && s.length > max ? s.slice(0, max - 1) + '…' : s;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column">
        <Text bold color={zen.info}>CHIMERA </Text>
        <Text dimColor>{sessionId}</Text>
      </Box>

      {/* Mode */}
      <Section label="Mode" color={zen.accent}>
        <Box flexDirection="row" flexWrap="wrap">
          {modes.map((m) => {
            const sel = m === mode;
            return (
              <Box key={m} marginRight={1}>
                <Text color={sel ? zen.accent : zen.muted} bold={sel}>
                  {sel ? '▸ ' : '  '}{modeIcons[m]} {m}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Section>

      {/* Preset */}
      <Section label="Preset" color="magenta">
        <Box flexDirection="row" flexWrap="wrap">
          {presets.map((p) => {
            const sel = p === preset;
            return (
              <Box key={p} marginRight={1}>
                <Text color={sel ? 'magenta' : zen.muted} bold={sel}>
                  {sel ? '▸ ' : '  '}{presetIcons[p]} {p}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Section>

      {/* Context */}
      <Section label="Context">
        <Text>{totalTokens.toLocaleString()} tokens</Text>
        <Text>{usagePercent}% used</Text>
        <Text>{formatCost(costData.currentCost)} spent</Text>
      </Section>

      {/* Working Directory */}
      {workingDir && (
        <Section label="Working Directory">
          <Text>{truncate(workingDir, (contentWidth ?? 40) - 2)}</Text>
        </Section>
      )}

      {/* Instructions */}
      {instructions && instructions.length > 0 && (
        <Section label="Instructions">
          {instructions.map((file, i) => (
            <Box key={i}>
              <Text color={zen.success}>● </Text>
              <Text>{truncate(file, (contentWidth ?? 40) - 4)}</Text>
            </Box>
          ))}
        </Section>
      )}

      {/* Tasks */}
      <Section label="Tasks">
        {agents.length === 0 && <Text dimColor>No active tasks</Text>}
        {agents.map((agent) => {
          const st = statusSymbols[agent.status];
          const roleColor = zen.role[agent.role] ?? zen.fg;
          return (
            <Box key={agent.id}>
              <Text color={st.color}>[{st.symbol}] </Text>
              <Text bold color={roleColor}>{agent.role}</Text>
              <Text dimColor> — {agent.status}</Text>
            </Box>
          );
        })}
      </Section>
    </Box>
  );
};
