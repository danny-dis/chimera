import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Mode, DeliberationMode } from '@chimera/core';
import { Chat } from './components/chat.js';
import { Input } from './components/input.js';
import { AgentDashboard } from './components/agent-dashboard.js';
import { CostTracker } from './components/cost-tracker.js';
import { ModeSelector } from './components/mode-selector.js';
import { PresetSelector } from './components/preset-selector.js';
import { EventLog } from './components/event-log.js';
import { StatusBar } from './components/status-bar.js';
import { SessionBrowser } from './components/session-browser.js';
import { DiffViewer } from './components/diff-viewer.js';
import { useLayout } from './hooks/use-layout.js';
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
  onSendMessage,
  onModeChange,
  onPresetChange,
  onSessionSelect,
  onSessionDelete,
  onExit,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [costData, setCostData] = useState<CostData>(initialCostData);
  const [events, setEvents] = useState<EventLogEntry[]>(initialEvents);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [preset, setPreset] = useState<DeliberationMode>(initialPreset);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<Overlay>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  const layout = useLayout(sidebarVisible);
  const focus = useFocus();

  useEffect(() => {
    if (initialMessages.length > 0) setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (initialAgents.length > 0) setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    setCostData(initialCostData);
  }, [initialCostData]);

  useEffect(() => {
    if (initialEvents.length > 0) setEvents(initialEvents);
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
  }), [mode, preset, costData, commandHistory, sessionId, onModeChange, onPresetChange]);

  const handleSlashCommand = useCallback((text: string) => {
    const ctx = buildCommandContext();
    const result = runCommand(text, ctx);

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

  useInput((input, key) => {
    if (key.ctrl && input === 'b') {
      setSidebarVisible((prev) => !prev);
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
  });

  if (!layout.isMinSize) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={layout.height}>
        <Text bold color="cyan">CHIMERA</Text>
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
          costData={costData}
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
            />
          ) : activeOverlay === 'diff' ? (
            <DiffViewer files={diffFiles} />
          ) : activeOverlay === 'agents' ? (
            <AgentDashboard agents={agents} />
          ) : activeOverlay === 'events' ? (
            <Box flexGrow={1} borderStyle="round" borderColor="gray">
              <EventLog events={events} height={chatHeight} />
            </Box>
          ) : (
            <Box flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
              <Chat messages={messages} focused={focus.isFocused(1)} height={chatHeight} />
            </Box>
          )}
          <Box marginTop={1} height={inputHeight}>
            <Input
              onSubmit={handleSendMessage}
              autocomplete={autocompleteCommand}
              disabled={activeOverlay !== null}
            />
          </Box>
        </Box>

        {/* Sidebar (conditional) */}
        {sidebarVisible && (
          <Box flexDirection="column" width={layout.sidebarWidth} marginLeft={1} borderStyle="single" borderColor="gray" paddingX={1}>
            <ModeSelector currentMode={mode} onModeChange={handleModeChange} />
            <Box marginTop={1}>
              <PresetSelector currentPreset={preset} onPresetChange={handlePresetChange} />
            </Box>
            <Box marginTop={1}>
              <AgentDashboard agents={agents} />
            </Box>
            <Box marginTop={1}>
              <CostTracker data={costData} />
            </Box>
            <Box marginTop={1} flexGrow={1}>
              <EventLog events={events} height={6} />
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box height={footerHeight} justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Ctrl+B Sidebar | Ctrl+C Exit</Text>
        <Text dimColor>Session: {sessionId}</Text>
      </Box>
    </Box>
  );
};
