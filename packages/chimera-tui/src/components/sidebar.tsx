import React from 'react';
import { Box, Text } from 'ink';
import type { Agent, CostData, SkillModelView } from '../types.js';
import { zen, hierarchy, roleColors, SPACING } from '../theme.js';
import { formatCost, statusSymbols } from './tui-utils.js';
import { ModeSelector } from './mode-selector.js';
import { PresetSelector } from './preset-selector.js';

interface SidebarProps {
  sessionId: string;
  mode: import('@chimera/core').Mode;
  preset: import('@chimera/core').DeliberationMode;
  agents: Agent[];
  costData: CostData;
  tokenUsage?: { input: number; output: number; total: number };
  instructions?: string[];
  contentWidth?: number;
  onModeChange?: (mode: import('@chimera/core').Mode) => void;
  onPresetChange?: (preset: import('@chimera/core').DeliberationMode) => void;
  skillModel?: SkillModelView;
}

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({
  label, color = zen.fg, children,
}) => (
  <Box flexDirection="column" marginTop={SPACING.sm}>
    <Text bold color={color}>{label.toUpperCase()}</Text>
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
  instructions,
  contentWidth,
  onModeChange,
  onPresetChange,
  skillModel,
}) => {
  const totalTokens = tokenUsage?.total
    ?? agents.reduce((sum, a) => sum + a.tokenUsage.input + a.tokenUsage.output, 0);
  const inputTokens = tokenUsage?.input
    ?? agents.reduce((sum, a) => sum + a.tokenUsage.input, 0);
  const outputTokens = tokenUsage?.output
    ?? agents.reduce((sum, a) => sum + a.tokenUsage.output, 0);
  const usagePercent = costData.budget > 0
    ? Math.round((costData.currentCost / costData.budget) * 100)
    : 0;
  const usageColor = usagePercent > 90 ? zen.error : usagePercent > 70 ? zen.warning : zen.success;

  const truncate = (s: string, max: number) =>
    contentWidth && s.length > max ? s.slice(0, max - 1) + '…' : s;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box flexDirection="column">
        <Text bold color={zen.accent}>◆ CHIMERA</Text>
        <Text {...hierarchy.tertiary}>{sessionId}</Text>
      </Box>

      {/* Mode — interactive */}
      <Section label="Mode" color={zen.accent}>
        <ModeSelector
          mode={mode}
          compact
          focused
          onSelect={onModeChange}
          skillModel={skillModel}
        />
      </Section>

      {/* Preset — interactive */}
      <Section label="Preset" color={zen.agent}>
        <PresetSelector
          preset={preset}
          compact
          focused
          onSelect={onPresetChange}
          skillModel={skillModel}
        />
      </Section>

      {/* Token usage meter */}
      <Section label="Token Usage" color={zen.info}>
        <Text {...hierarchy.primary}>{totalTokens.toLocaleString()} tokens</Text>
        <Text {...hierarchy.tertiary}>
          {inputTokens.toLocaleString()} in · {outputTokens.toLocaleString()} out
        </Text>
        <Text color={usageColor}>
          {'█'.repeat(Math.min(10, Math.round(usagePercent / 10)))}
          {'░'.repeat(Math.max(0, 10 - Math.round(usagePercent / 10)))} {usagePercent}% budget
        </Text>
        <Text {...hierarchy.tertiary}>{formatCost(costData.currentCost)} spent</Text>
      </Section>

      {/* Working Directory */}
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

      {/* Tasks / Agents */}
      <Section label="Agents">
        {agents.length === 0 && <Text {...hierarchy.tertiary}>○ No active agents</Text>}
        {agents.map((agent) => {
          const st = statusSymbols[agent.status];
          const roleColor = roleColors(agent.role);
          return (
            <Box key={agent.id}>
              <Text color={st.color}>[{st.symbol}] </Text>
              <Text bold color={roleColor}>{agent.role}</Text>
              <Text {...hierarchy.tertiary}> — {agent.status}</Text>
            </Box>
          );
        })}
      </Section>

      {/* Capabilities legend */}
      <Section label="Capabilities">
        {(['writer', 'reviewer', 'challenger', 'synthesizer'] as const).map((r) => (
          <Box key={r}>
            <Text color={roleColors(r)}>● </Text>
            <Text bold color={roleColors(r)}>{r}</Text>
            <Text {...hierarchy.tertiary}> · {r === 'writer' ? 'implements' : r === 'reviewer' ? 'verifies' : r === 'challenger' ? 'attacks' : 'merges'}</Text>
          </Box>
        ))}
      </Section>
    </Box>
  );
};
