import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { statusSymbols, budgetColor, formatTime } from './tui-utils.js';
import { zen, MODE_META } from '../theme.js';
// ── Mini cost bar (10 chars wide) ───────────────────────────────────────
const MiniCostBar = ({ used, total, width = 10, }) => {
    if (total <= 0)
        return null;
    const ratio = Math.min(used / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const color = budgetColor(ratio);
    return (<Box>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
    </Box>);
};
// ── Clock ────────────────────────────────────────────────────────────────
const Clock = () => {
    const [time, setTime] = useState('');
    useEffect(() => {
        const update = () => setTime(formatTime(Date.now()));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);
    return <Text dimColor>{time}</Text>;
};
// ── Component ────────────────────────────────────────────────────────────
export const StatusBar = ({ mode, costData, agents, activeTool, sidebarVisible = false, workingDir, }) => {
    const ratio = costData.budget > 0 ? costData.currentCost / costData.budget : 0;
    const costColor = budgetColor(ratio);
    const projectName = workingDir
        ? workingDir.split(/[/\\]/).filter(Boolean).pop() ?? 'CHIMERA'
        : 'CHIMERA';
    return (<Box borderStyle="single" borderColor={zen.border} paddingX={1} justifyContent="space-between">
      {/* Brand + mode */}
      <Box marginRight={1}>
        <Text bold color={zen.info}>{projectName} </Text>
        <Text dimColor>v0.0.1</Text>
        <Text> </Text>
        <Text color={zen.accent} bold>{MODE_META[mode]?.icon ?? '?'} {mode}</Text>
      </Box>

      {/* Cost */}
      <Box marginRight={1}>
        <Text color={costColor} bold>
          ${costData.currentCost.toFixed(4)}
        </Text>
        <Text dimColor> / ${costData.budget.toFixed(2)} </Text>
        <MiniCostBar used={costData.currentCost} total={costData.budget}/>
      </Box>

      {/* Agent statuses */}
      {agents.length > 0 && (<Box marginRight={1}>
          {agents.map((agent) => {
                const st = statusSymbols[agent.status] ?? statusSymbols.pending;
                return (<Box key={agent.id} marginRight={1}>
                <Text color={st.color}>{st.symbol}</Text>
                <Text dimColor> {agent.role} </Text>
              </Box>);
            })}
        </Box>)}

      {/* Active tool */}
      {activeTool && activeTool.status === 'running' && (<Box marginRight={1}>
          <Text color={zen.warning}><Spinner type="dots"/></Text>
          <Text color={zen.warning}> {activeTool.tool}</Text>
          {activeTool.args && <Text dimColor> {activeTool.args.slice(0, 30)}</Text>}
        </Box>)}
      {activeTool && activeTool.status === 'completed' && (<Box marginRight={1}>
          <Text color={zen.success}>✓</Text>
          <Text dimColor> {activeTool.tool}</Text>
        </Box>)}
      {activeTool && activeTool.status === 'error' && (<Box marginRight={1}>
          <Text color={zen.error}>✗</Text>
          <Text dimColor> {activeTool.tool}</Text>
        </Box>)}

      {/* Sidebar indicator */}
      <Box marginRight={1}>
        <Text dimColor>{sidebarVisible ? '◧' : '◨'}</Text>
      </Box>

      {/* Clock */}
      <Clock />
    </Box>);
};
//# sourceMappingURL=status-bar.js.map