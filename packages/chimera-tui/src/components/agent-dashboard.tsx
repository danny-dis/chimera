import React from 'react';
import { Box, Text } from 'ink';
import type { Agent, SkillModelView } from '../types.js';
import { statusSymbols } from './tui-utils.js';
import { zen, hierarchy, tiered, roleColors, PANEL_BORDER } from '../theme.js';
import { AGENT_CAPABILITIES, PRESET_CAPABILITIES, getAgentCapability } from '../agent-capabilities.js';
import { EmptyState } from './empty-state.js';

interface AgentDashboardProps {
  agents: Agent[];
  contentWidth?: number;
  skillModel?: SkillModelView;
}

const AgentRow: React.FC<{ agent: Agent; contentWidth?: number }> = ({ agent, contentWidth }) => {
  const roleColor = roleColors(agent.role);
  const status = statusSymbols[agent.status];
  const showDetails = !contentWidth || contentWidth >= 30;
  const capability = getAgentCapability(agent.role);

  const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
  const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={status.color}>{status.symbol} </Text>
        <Text bold color={roleColor}>
          {showDetails ? capability.title.padEnd(13) : capability.title}
        </Text>
        {showDetails && <Text {...hierarchy.tertiary}>{agent.provider}/{agent.model}</Text>}
        {showDetails && tokenStr && <Text {...hierarchy.tertiary}> {tokenStr}</Text>}
        {agent.progress !== undefined && (
          <Text color={zen.accent}> [{Math.round(agent.progress * 100)}%]</Text>
        )}
      </Box>
      {showDetails && (
        <Box marginLeft={2}>
          <Text {...hierarchy.tertiary}>{capability.capability}</Text>
        </Box>
      )}
    </Box>
  );
};

const CapabilityRow: React.FC<{ capability: (typeof AGENT_CAPABILITIES)[number]; compact: boolean }> = ({
  capability,
  compact,
}) => {
  const roleColor = roleColors(capability.role);

  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      <Box>
        <Text color={roleColor} bold>{capability.title.padEnd(compact ? 0 : 13)}</Text>
        {!compact && <Text {...hierarchy.tertiary}>{capability.capability}</Text>}
      </Box>
      {!compact && (
        <Box marginLeft={15}>
          <Text {...hierarchy.tertiary}>Outputs: {capability.outputs}</Text>
        </Box>
      )}
    </Box>
  );
};

/** Full panel version (used as overlay). */
export const AgentDashboard: React.FC<AgentDashboardProps> = ({ agents, contentWidth, skillModel }) => {
  const running = agents.filter((a) => a.status === 'running').length;
  const completed = agents.filter((a) => a.status === 'completed').length;
  const errored = agents.filter((a) => a.status === 'error').length;
  const compact = Boolean(contentWidth && contentWidth < 48);

  return (
    <Box flexDirection="column" borderStyle={PANEL_BORDER} borderColor={zen.borderActive} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={zen.accent}>
          {contentWidth && contentWidth < 25 ? 'Agents' : 'Agent Control'}
        </Text>
        <Text {...hierarchy.tertiary}>
          {' '}
          ({agents.length}{running > 0 ? `, ${running} run` : ''}{completed > 0 ? `, ${completed} done` : ''}
          {errored > 0 ? `, ${errored} err` : ''})
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Live agents</Text>
        {agents.length === 0 && (
          <EmptyState
            icon="○"
            message={tiered({
              beginner: 'No active agents yet — when a task starts, the agents assigned by your chosen preset appear here with their status and what they can do.',
              intermediate: 'No active agents. Capabilities remain available by preset.',
              advanced: 'No active agents.',
            }, skillModel)}
          />
        )}
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} contentWidth={contentWidth} />
        ))}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Role capabilities</Text>
        {AGENT_CAPABILITIES.map((capability) => (
          <CapabilityRow key={capability.role} capability={capability} compact={compact} />
        ))}
      </Box>

      {!compact && (
        <Box flexDirection="column">
          <Text bold>Execution presets</Text>
          {PRESET_CAPABILITIES.map((preset) => (
            <Box key={preset.preset}>
              <Text color={zen.accent}>{preset.label.padEnd(8)}</Text>
              <Text {...hierarchy.tertiary}>{preset.capability}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

/** Compact single-line version (used in status bar). */
export const AgentStatusLine: React.FC<AgentDashboardProps> = ({ agents }) => {
  if (agents.length === 0) return null;
  return (
    <Box>
      {agents.map((agent) => {
        const st = statusSymbols[agent.status] ?? statusSymbols.pending;
        return (
          <Box key={agent.id} marginRight={1}>
            <Text color={st.color}>{st.symbol}</Text>
            <Text dimColor> {agent.role} </Text>
          </Box>
        );
      })}
    </Box>
  );
};
