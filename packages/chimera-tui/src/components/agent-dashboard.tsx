import React from 'react';
import { Box, Text } from 'ink';
import type { Agent } from '../types.js';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';

interface AgentDashboardProps {
  agents: Agent[];
}

const AgentRow: React.FC<{ agent: Agent }> = ({ agent }) => {
  const roleColor = zen.role[agent.role] ?? 'white';
  const status = statusSymbols[agent.status];

  const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
  const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';

  return (
    <Box>
      <Text color={status.color}>{status.symbol} </Text>
      <Text bold color={roleColor}>
        {agent.role.padEnd(14)}
      </Text>
      <Text dimColor>{agent.model}</Text>
      {tokenStr && <Text dimColor> {tokenStr}</Text>}
      {agent.progress !== undefined && (
        <Text color="cyan"> [{Math.round(agent.progress * 100)}%]</Text>
      )}
    </Box>
  );
};

/** Full panel version (used as overlay). */
export const AgentDashboard: React.FC<AgentDashboardProps> = ({ agents }) => {
  const running = agents.filter((a) => a.status === 'running').length;
  const completed = agents.filter((a) => a.status === 'completed').length;
  const errored = agents.filter((a) => a.status === 'error').length;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Agent Dashboard
        </Text>
        <Text dimColor>
          {' '}
          ({agents.length} total, {running} running, {completed} done
          {errored > 0 ? `, ${errored} errors` : ''})
        </Text>
      </Box>

      {agents.length === 0 && <Text dimColor>No active agents</Text>}

      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} />
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
