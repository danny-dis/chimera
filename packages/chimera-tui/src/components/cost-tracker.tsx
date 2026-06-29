import React from 'react';
import { Box, Text } from 'ink';
import type { CostData } from '../types.js';
import { formatCost, budgetColor } from './tui-utils.js';
import { zen } from '../theme.js';

interface CostTrackerProps {
  data: CostData;
  showBreakdown?: boolean;
  contentWidth?: number;
}

const BudgetBar: React.FC<{ used: number; total: number; width?: number }> = ({
  used,
  total,
  width = 20,
}) => {
  const ratio = Math.min(used / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const color = budgetColor(ratio);

  return (
    <Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text> </Text>
      <Text color={color}>{Math.round(ratio * 100)}%</Text>
    </Box>
  );
};

/** Full panel version (used as overlay). */
export const CostTracker: React.FC<CostTrackerProps> = ({ data, showBreakdown = true, contentWidth }) => {
  const remaining = Math.max(0, data.budget - data.currentCost);
  const isNarrow = contentWidth !== undefined && contentWidth < 30;

  if (isNarrow) {
    return (
      <Box borderStyle="round" borderColor={zen.success} paddingX={1}>
        <Text bold color={zen.success}>Cost </Text>
        <Text bold>{formatCost(data.currentCost)}</Text>
        <Text dimColor> / {formatCost(data.budget)}</Text>
      </Box>
    );
  }

  if (data.currentCost === 0 && data.breakdown.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={zen.success} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={zen.success}>Cost Tracker</Text>
        </Box>
        <Text dimColor>No costs yet. Start a task to see usage.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={zen.success} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={zen.success}>
          Cost Tracker
        </Text>
      </Box>

      <Box>
        <Text>Spent: </Text>
        <Text bold color={budgetColor(data.budget > 0 ? data.currentCost / data.budget : 0)}>
          {formatCost(data.currentCost)}
        </Text>
        <Text> / </Text>
        <Text>{formatCost(data.budget)}</Text>
      </Box>

      <Box>
        <Text>Remaining: </Text>
        <Text color={remaining > 0 ? zen.success : zen.error}>{formatCost(remaining)}</Text>
      </Box>

      <Box marginTop={1}>
        <BudgetBar used={data.currentCost} total={data.budget} />
      </Box>

      {showBreakdown && data.breakdown.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>
            Breakdown:
          </Text>
          {data.breakdown.map((item, i) => {
            const label = `${item.provider}/${item.model}`;
            const cost = formatCost(item.cost);
            const tokens = item.inputTokens + item.outputTokens;
            const maxLabelLen = contentWidth ? Math.max(8, contentWidth - 16) : 30;
            const truncatedLabel = label.length > maxLabelLen ? label.slice(0, maxLabelLen - 1) + '…' : label;
            return (
              <Box key={i} marginLeft={2}>
                <Text>{truncatedLabel}: </Text>
                <Text color={zen.success}>{cost}</Text>
                <Text dimColor> ({tokens} tok)</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

/** Compact single-line version (used in status bar). */
export const CostStatusLine: React.FC<{ data: CostData }> = ({ data }) => {
  const ratio = data.budget > 0 ? data.currentCost / data.budget : 0;
  const color = budgetColor(ratio);

  return (
    <Box>
      <Text color={color} bold>{formatCost(data.currentCost)}</Text>
      <Text dimColor> / {formatCost(data.budget)}</Text>
    </Box>
  );
};
