import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Mode, DeliberationMode } from '@chimera/core';
import { Chat } from './components/chat.js';
import { Input } from './components/input.js';
import { Sidebar } from './components/sidebar.js';
import { AgentDashboard } from './components/agent-dashboard.js';
import { EventLog } from './components/event-log.js';
import { StatusBar } from './components/status-bar.js';
import { SessionBrowser } from './components/session-browser.js';
import { DiffViewer } from './components/diff-viewer.js';
import { useLayout } from './hooks/use-layout.js';
import { zen, tiered } from './theme.js';
import { useFocus } from './hooks/use-focus.js';
import { runCommand, autocompleteCommand } from './commands/commands.js';
import type { CommandContext } from './commands/commands.js';
import type { Message, Agent, CostData, EventLogEntry, TUIProps } from './types.js';

type Overlay = 'sessions' | 'diff' | 'agents' | 'events' | null;

export const TUI: React.FC<TUIProps> = ({
  mode: initialMode = 'code',
  preset: initialPreset = 'solo',
  sessionId = 'active',
  messages: initialMessages = [],
  agents: initialAgents = [],
  costData: initialCostData = { currentCost: 0, budget: 10, breakdown: [] },
  sessions = [],
  diffFiles = [],
  events: initialEvents = [],
  activeTool,
  instructions,
  tokenUsage,
  onSendMessage,
  onModeChange,
  onPresetChange,
  onSessionSelect,
  onSessionDelete,
  onExit,
  skillModel,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [costData, setCostData] = useState<CostData>(initialCostData);
  const [events, setEvents] = useState<EventLogEntry[]>(initialEvents);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [preset, setPreset] = useState<DeliberationMode>(initialPreset);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeOverlay, setActiveOverlay] = useState<Overlay>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  // Bumped whenever the skill model's explanation depth is toggled so that
  // tiered copy (driven by model.tier()/explainDepth()) re-renders live.
  const [, setExplainVersion] = useState(0);
  const bumpExplain = useCallback(() => setExplainVersion((v) => v + 1), []);

  const layout = useLayout(sidebarVisible);
  const focus = useFocus();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    setCostData(initialCostData);
  }, [initialCostData]);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setPreset(initialPreset);
  }, [initialPreset]);

  const buildCommandContext = useCallback((): CommandContext => ({
    getMode: () => mode,
    setMode: (m) => {
      setMode(m);
      onModeChange?.(m);
    },
    getPreset: () => preset,
    setPreset: (p) => {
      setPreset(p);
      onPresetChange?.(p);
    },
    getCostData: () => costData,
    getHistory: () => commandHistory,
    sessionId,
    skillModel,
  }), [mode, preset, costData, commandHistory, sessionId, onModeChange, onPresetChange, skillModel]);

  const handleSlashCommand = useCallback(async (text: string) => {
    const ctx = buildCommandContext();
    const result = await runCommand(text, ctx);

    if (result.clearMessages) {
      setMessages([]);
    }
    if (result.exit) {
      onExit?.();
      process.exit(0);
    }
    if (result.viewHint) {
      setActiveOverlay(result.viewHint);
    }
    if (result.output.length > 0) {
      const sysMsg: Message = {
        id: `cmd-${Date.now()}`,
        role: 'system',
        content: result.output.join('\n'),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, sysMsg]);
    }
    setCommandHistory((prev) => [...prev, text]);
  }, [buildCommandContext, onExit]);

  const handleSendMessage = useCallback((text: string) => {
    if (text.startsWith('/')) {
      handleSlashCommand(text);
      return;
    }
    onSendMessage?.(text);
  }, [handleSlashCommand, onSendMessage]);

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode);
    onModeChange?.(newMode);
  }, [onModeChange]);

  const handlePresetChange = useCallback((newPreset: DeliberationMode) => {
    setPreset(newPreset);
    onPresetChange?.(newPreset);
  }, [onPresetChange]);

  // Derive token usage from agents when the host doesn't supply it.
  const derivedTokenUsage = useMemo<{ input: number; output: number; total: number }>(() => {
    if (tokenUsage) return tokenUsage;
    const input = agents.reduce((s, a) => s + a.tokenUsage.input, 0);
    const output = agents.reduce((s, a) => s + a.tokenUsage.output, 0);
    return { input, output, total: input + output };
  }, [tokenUsage, agents]);

  useInput((input, key) => {
    if (key.ctrl && input === 'b') {
      setSidebarVisible((prev) => !prev);
      return;
    }
    if (key.ctrl && input === 'd') {
      if (diffFiles.length > 0) {
        setActiveOverlay((prev) => (prev === 'diff' ? null : 'diff'));
      }
      return;
    }
    if (key.escape) {
      if (activeOverlay) {
        setActiveOverlay(null);
        return;
      }
    }
    if (key.ctrl && input === 'c') {
      onExit?.();
      process.exit(0);
    }
    // Adaptive-onboarding: reversible explain depth toggle (more ↔ less ↔ default).
    // Stays live even while an overlay is open; only consumes bare keypresses.
    if (!key.ctrl && !key.meta && !key.shift && !key.return && !key.escape) {
      if (input === 'm' && skillModel?.setExplainMore) {
        skillModel.setExplainMore();
        bumpExplain();
        return;
      }
      if (input === 'l' && skillModel?.setExplainLess) {
        skillModel.setExplainLess();
        bumpExplain();
        return;
      }
    }
  });

  if (!layout.isMinSize) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={layout.height}>
        <Text bold color={zen.accent}>CHIMERA</Text>
        <Box marginTop={1}>
          <Text dimColor>Terminal too small. Resize to at least 80x24.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Current: {layout.width}x{layout.height}</Text>
        </Box>
      </Box>
    );
  }

  const statusBarHeight = 1;
  const footerHeight = 2;
  const inputHeight = 3;
  const chatHeight = layout.height - statusBarHeight - footerHeight - inputHeight - 2;

  return (
    <Box flexDirection="column" height={layout.height}>
      <Box height={statusBarHeight}>
        <StatusBar
          mode={mode}
          agents={agents}
          activeTool={activeTool}
          sidebarVisible={sidebarVisible}
        />
      </Box>

      <Box flexDirection="row" flexGrow={1} padding={1}>
        {/* Main content area */}
        <Box flexDirection="column" flexGrow={1}>
          {activeOverlay === 'sessions' ? (
            <SessionBrowser
              sessions={sessions}
              onSelect={onSessionSelect}
              onDelete={onSessionDelete}
              skillModel={skillModel}
            />
          ) : activeOverlay === 'diff' ? (
            <DiffViewer files={diffFiles} skillModel={skillModel} />
          ) : activeOverlay === 'agents' ? (
            <AgentDashboard agents={agents} skillModel={skillModel} />
          ) : activeOverlay === 'events' ? (
            <Box flexGrow={1} borderStyle="round" borderColor={zen.border}>
              <EventLog events={events} height={chatHeight} skillModel={skillModel} />
            </Box>
          ) : (
            <Box flexGrow={1} borderStyle="round" borderColor={zen.border} paddingX={1}>
              <Chat messages={messages} focused={focus.isFocused(1)} height={chatHeight} width={layout.chatWidth} skillModel={skillModel} />
            </Box>
          )}
          <Box marginTop={1} height={inputHeight}>
            <Input
              onSubmit={handleSendMessage}
              autocomplete={autocompleteCommand}
              disabled={activeOverlay !== null}
              placeholder={tiered({
                beginner: 'e.g. "Refactor utils.ts to use async/await"',
                intermediate: 'Type a message or /help for commands...',
                advanced: '> ',
              }, skillModel)}
            />
          </Box>
          {messages.length === 0 && activeOverlay === null && (
            <Box marginTop={1}>
              <Text dimColor>
                {tiered({
                  beginner:
                    'Tip: describe a task in plain language (try "fix the login bug"), or run /help for the full command list.',
                  intermediate:
                    'Tip: type a task, run /help for commands, Ctrl+B toggles the sidebar, /agents /events /diff for details.',
                  advanced: 'Tip: /help for commands.',
                }, skillModel)}
              </Text>
            </Box>
          )}
        </Box>

        {/* Sidebar (conditional) */}
        {sidebarVisible && (
          <Box flexDirection="column" width={layout.sidebarWidth} marginLeft={1} borderStyle="single" borderColor={zen.border}>
            <Sidebar
              sessionId={sessionId}
              mode={mode}
              preset={preset}
              agents={agents}
              costData={costData}
              tokenUsage={derivedTokenUsage}
              instructions={instructions}
              contentWidth={layout.sidebarContentWidth}
              onModeChange={handleModeChange}
              onPresetChange={handlePresetChange}
              skillModel={skillModel}
            />
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box height={footerHeight} justifyContent="space-between" borderStyle="single" borderColor={zen.border} paddingX={1}>
        <Text dimColor>
          <Text color={zen.accent}>Ctrl+B</Text> Sidebar · <Text color={zen.accent}>Tab</Text> Focus ·
          <Text color={zen.accent}>/help</Text> · <Text color={zen.accent}>/agents</Text> <Text color={zen.accent}>/events</Text> <Text color={zen.accent}>/diff</Text> ·
          <Text color={zen.accent}>Esc</Text> Close · <Text color={zen.accent}>Ctrl+C</Text> Exit
          {' · '}<Text color={zen.accent}>(m)</Text> more · <Text color={zen.accent}>(l)</Text> less detail
        </Text>
        <Text dimColor>
          {process.env.CHIMERA_DEV && skillModel
            ? `Session: ${sessionId} · ${skillModel.tier()} (${skillModel.tierReason()})`
            : `Session: ${sessionId}`}
        </Text>
      </Box>
    </Box>
  );
};
