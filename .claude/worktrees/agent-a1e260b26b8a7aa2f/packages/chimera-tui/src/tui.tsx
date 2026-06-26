import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Mode } from '@chimera/core';
import { Chat } from './components/chat.js';
import { Input } from './components/input.js';
import { AgentDashboard } from './components/agent-dashboard.js';
import { CostTracker } from './components/cost-tracker.js';
import { ModeSelector } from './components/mode-selector.js';
import { EventLog } from './components/event-log.js';
import type { Message, Agent, CostData, EventLogEntry, TUIProps } from './types.js';

export const TUI: React.FC<TUIProps> = ({
  mode: initialMode = 'code',
  messages: initialMessages = [],
  agents: initialAgents = [],
  costData: initialCostData = { currentCost: 0, budget: 10, breakdown: [] },
  events: initialEvents = [],
  onSendMessage,
  onModeChange,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [costData, setCostData] = useState<CostData>(initialCostData);
  const [events, setEvents] = useState<EventLogEntry[]>(initialEvents);
  const [mode, setMode] = useState<Mode>(initialMode);

  // Sync with props if they change from parent
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

  const handleSendMessage = (text: string) => {
    if (onSendMessage) {
      onSendMessage(text);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (onModeChange) {
      onModeChange(newMode);
    }
  };

  return (
    <Box flexDirection="column" height="100%" padding={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between" borderStyle="single" borderColor="blue" paddingX={1}>
        <Box>
          <Text bold color="blue">CHIMERA </Text>
          <Text dimColor>v0.0.1</Text>
        </Box>
        <Box>
          <Text>Session: </Text>
          <Text bold color="cyan">active</Text>
        </Box>
      </Box>

      {/* Main Content */}
      <Box flexGrow={1}>
        {/* Left Column: Chat & Input */}
        <Box flexDirection="column" width="65%" marginRight={1}>
          <Box flexGrow={1} borderStyle="round" borderColor="white" paddingX={1}>
            <Chat messages={messages} />
          </Box>
          <Box marginTop={1}>
            <Input onSubmit={handleSendMessage} />
          </Box>
        </Box>

        {/* Right Column: Sidebar Panels */}
        <Box flexDirection="column" width="35%">
          <ModeSelector currentMode={mode} onModeChange={handleModeChange} />
          <Box marginTop={1}>
            <AgentDashboard agents={agents} />
          </Box>
          <Box marginTop={1}>
            <CostTracker data={costData} />
          </Box>
          <Box marginTop={1} flexGrow={1}>
            <EventLog events={events} maxVisible={10} />
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>↑↓ Navigate | Enter Select | Ctrl+C Exit</Text>
        <Text color="gray">Mode: {mode.toUpperCase()}</Text>
      </Box>
    </Box>
  );
};
