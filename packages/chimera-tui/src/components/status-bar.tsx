import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'node:module';
import type { Mode } from '@chimera/core';
import type { Agent, ToolActivity } from '../types.js';
import Spinner from 'ink-spinner';
import { statusSymbols, formatTime } from './tui-utils.js';
import { zen, MODE_META } from '../theme.js';

// ── Version (read at module load so the bar always matches package.json) ──

const require = createRequire(import.meta.url);
const CHIMERA_VERSION: string = (() => {
  try {
    return require('../../package.json').version as string;
  } catch {
    return '0.0.0';
  }
})();

// ── Clock ────────────────────────────────────────────────────────────────

const Clock: React.FC = () => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => setTime(formatTime(Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return <Text dimColor>{time}</Text>;
};

// ── Props ────────────────────────────────────────────────────────────────

interface StatusBarProps {
  mode: Mode;
  agents: Agent[];
  activeTool?: ToolActivity;
  sidebarVisible?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  agents,
  activeTool,
  sidebarVisible = false,
}) => {
  return (
    <Box borderStyle="single" borderColor={zen.border} paddingX={1} justifyContent="space-between">
      {/* Brand + mode */}
      <Box marginRight={1}>
        <Text bold color={zen.info}>CHIMERA</Text>
        <Text dimColor> v{CHIMERA_VERSION}</Text>
        <Text> </Text>
        <Text color={zen.accent} bold>{MODE_META[mode]?.icon ?? '?'} {mode}</Text>
      </Box>

      {/* Agent statuses */}
      {agents.length > 0 && (
        <Box marginRight={1}>
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
      )}

      {/* Active tool */}
      {activeTool && activeTool.status === 'running' && (
        <Box marginRight={1}>
          <Text color={zen.warning}><Spinner type="dots" /></Text>
          <Text color={zen.warning}> {activeTool.tool}</Text>
          {activeTool.args && <Text dimColor> {activeTool.args.slice(0, 30)}</Text>}
        </Box>
      )}
      {activeTool && activeTool.status === 'completed' && (
        <Box marginRight={1}>
          <Text color={zen.success}>✓</Text>
          <Text dimColor> {activeTool.tool}</Text>
        </Box>
      )}
      {activeTool && activeTool.status === 'error' && (
        <Box marginRight={1}>
          <Text color={zen.error}>✗</Text>
          <Text dimColor> {activeTool.tool}</Text>
        </Box>
      )}

      {/* Sidebar indicator */}
      <Box marginRight={1}>
        <Text dimColor>{sidebarVisible ? '◧' : '◨'}</Text>
      </Box>

      {/* Clock */}
      <Clock />
    </Box>
  );
};
