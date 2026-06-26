import React from 'react';
import { Box, Text } from 'ink';
import type { Agent } from '../types.js';

interface AgentDashboardProps {
  agents: Agent[];
}

const roleColors: Record<string, string> = {
  writer: 'green',
  reviewer: 'cyan',
  challenger: 'magenta',
  synthesizer: 'yellow',
  planner: 'blue',
  researcher: 'white',
  summarizer: 'gray',
};

const statusIndicators: Record<string, { symbol: string; color: string }> = {
  pending: { symbol: '○', color: 'gray' },
  running: { symbol: '◉', color: 'yellow' },
  completed: { symbol: '✓', color: 'green' },
  error: { symbol: '✗', color: 'red' },
};

const AgentRow: React.FC<{ agent: Agent }> = ({ agent }) => {
  const roleColor = roleColors[agent.role] ?? 'white';
  const status = statusIndicators[agent.status];

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
