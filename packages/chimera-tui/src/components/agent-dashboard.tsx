import React from 'react';
import { Box, Text } from 'ink';
import type { Agent } from '../types.js';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';

interface AgentDashboardProps {
  agents: Agent[];
  contentWidth?: number;
}

const AgentRow: React.FC<{ agent: Agent; contentWidth?: number }> = ({ agent, contentWidth }) => {
  const roleColor = zen.role[agent.role] ?? 'white';
  const status = statusSymbols[agent.status];
  const showDetails = !contentWidth || contentWidth >= 30;

  const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
  const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';

  return (
    <Box>
      <Text color={status.color}>{status.symbol} </Text>
      <Text bold color={roleColor}>
        {showDetails ? agent.role.padEnd(14) : agent.role}
      </Text>
      {showDetails && <Text dimColor>{agent.model}</Text>}
      {showDetails && tokenStr && <Text dimColor> {tokenStr}</Text>}
      {agent.progress !== undefined && (
        <Text color="cyan"> [{Math.round(agent.progress * 100)}%]</Text>
      )}
    </Box>
  );
};

/** Full panel version (used as overlay). */
export const AgentDashboard: React.FC<AgentDashboardProps> = ({ agents, contentWidth }) => {
  const running = agents.filter((a) => a.status === 'running').length;
  const completed = agents.filter((a) => a.status === 'completed').length;
  const errored = agents.filter((a) => a.status === 'error').length;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {contentWidth && contentWidth < 25 ? 'Agents' : 'Agent Dashboard'}
        </Text>
        <Text dimColor>
          {' '}
          ({agents.length}{running > 0 ? `, ${running} run` : ''}{completed > 0 ? `, ${completed} done` : ''}
          {errored > 0 ? `, ${errored} err` : ''})
        </Text>
      </Box>

      {agents.length === 0 && <Text dimColor>No active agents</Text>}

      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} contentWidth={contentWidth} />
      ))}
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
