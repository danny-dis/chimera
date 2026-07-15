import React from 'react';
import { Box, Text } from 'ink';
import type { Agent, SkillModelView } from '../types.js';
import { statusSymbols } from './tui-utils.js';
import { zen, tiered } from '../theme.js';
import { AGENT_CAPABILITIES, PRESET_CAPABILITIES, getAgentCapability } from '../agent-capabilities.js';

interface AgentDashboardProps {
  agents: Agent[];
  contentWidth?: number;
  skillModel?: SkillModelView;
}

const AgentRow: React.FC<{ agent: Agent; contentWidth?: number }> = ({ agent, contentWidth }) => {
  const roleColor = zen.role[agent.role] ?? 'white';
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
        {showDetails && <Text dimColor>{agent.provider}/{agent.model}</Text>}
        {showDetails && tokenStr && <Text dimColor> {tokenStr}</Text>}
        {agent.progress !== undefined && (
          <Text color={zen.accent}> [{Math.round(agent.progress * 100)}%]</Text>
        )}
      </Box>
      {showDetails && (
        <Box marginLeft={2}>
          <Text dimColor>{capability.capability}</Text>
        </Box>
      )}
    </Box>
  );
};

const CapabilityRow: React.FC<{ capability: (typeof AGENT_CAPABILITIES)[number]; compact: boolean }> = ({
  capability,
  compact,
}) => {
  const roleColor = zen.role[capability.role] ?? 'white';

  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      <Box>
        <Text color={roleColor} bold>{capability.title.padEnd(compact ? 0 : 13)}</Text>
        {!compact && <Text dimColor>{capability.capability}</Text>}
      </Box>
      {!compact && (
        <Box marginLeft={15}>
          <Text dimColor>Outputs: {capability.outputs}</Text>
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
    <Box flexDirection="column" borderStyle="single" borderColor={zen.borderActive} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={zen.accent}>
          {contentWidth && contentWidth < 25 ? 'Agents' : 'Agent Control'}
        </Text>
        <Text dimColor>
          {' '}
          ({agents.length}{running > 0 ? `, ${running} run` : ''}{completed > 0 ? `, ${completed} done` : ''}
          {errored > 0 ? `, ${errored} err` : ''})
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Live agents</Text>
        {agents.length === 0 && <Text dimColor>{tiered({
          beginner: 'No active agents yet — when a task starts, the agents assigned by your chosen preset appear here with their status and what they can do.',
          intermediate: 'No active agents. Capabilities remain available by preset.',
          advanced: 'No active agents.',
        }, skillModel)}</Text>}
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
              <Text dimColor>{preset.capability}</Text>
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
