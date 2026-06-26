import React from 'react';
import { Box, Text } from 'ink';
import type { CostData } from '../types.js';

interface CostTrackerProps {
  data: CostData;
  showBreakdown?: boolean;
}

const formatCost = (cost: number): string => `$${cost.toFixed(4)}`;

const BudgetBar: React.FC<{ used: number; total: number; width?: number }> = ({
  used,
  total,
  width = 20,
}) => {
  const ratio = Math.min(used / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const color = ratio > 0.9 ? 'red' : ratio > 0.7 ? 'yellow' : 'green';

  return (
    <Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text> </Text>
      <Text color={color}>{Math.round(ratio * 100)}%</Text>
    </Box>
  );
};

export const CostTracker: React.FC<CostTrackerProps> = ({ data, showBreakdown = true }) => {
  const remaining = Math.max(0, data.budget - data.currentCost);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          Cost Tracker
        </Text>
      </Box>

      <Box>
        <Text>Spent: </Text>
        <Text bold color={data.currentCost > data.budget * 0.9 ? 'red' : 'green'}>
          {formatCost(data.currentCost)}
        </Text>
        <Text> / </Text>
        <Text>{formatCost(data.budget)}</Text>
      </Box>

      <Box>
        <Text>Remaining: </Text>
        <Text color={remaining > 0 ? 'green' : 'red'}>{formatCost(remaining)}</Text>
      </Box>

      <Box marginTop={1}>
        <BudgetBar used={data.currentCost} total={data.budget} />
      </Box>

      {showBreakdown && data.breakdown.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Breakdown:
          </Text>
          {data.breakdown.map((item, i) => (
            <Box key={i} marginLeft={2}>
              <Text>
                {item.provider}/{item.model}:{' '}
              </Text>
              <Text color="green">{formatCost(item.cost)}</Text>
              <Text dimColor>
                {' '}
                ({item.inputTokens + item.outputTokens} tok)
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
