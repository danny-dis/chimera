import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Chat } from './components/chat.js';
import { Input } from './components/input.js';
import { AgentDashboard } from './components/agent-dashboard.js';
import { CostTracker } from './components/cost-tracker.js';
import { ModeSelector } from './components/mode-selector.js';
import { EventLog } from './components/event-log.js';
export const TUI = ({ mode: initialMode = 'code', messages: initialMessages = [], agents: initialAgents = [], costData: initialCostData = { currentCost: 0, budget: 10, breakdown: [] }, events: initialEvents = [], onSendMessage, onModeChange, }) => {
    const [messages, setMessages] = useState(initialMessages);
    const [agents, setAgents] = useState(initialAgents);
    const [costData, setCostData] = useState(initialCostData);
    const [events, setEvents] = useState(initialEvents);
    const [mode, setMode] = useState(initialMode);
    // Sync with props if they change from parent
    useEffect(() => {
        if (initialMessages.length > 0)
            setMessages(initialMessages);
    }, [initialMessages]);
    useEffect(() => {
        if (initialAgents.length > 0)
            setAgents(initialAgents);
    }, [initialAgents]);
    useEffect(() => {
        setCostData(initialCostData);
    }, [initialCostData]);
    useEffect(() => {
        if (initialEvents.length > 0)
            setEvents(initialEvents);
    }, [initialEvents]);
    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);
    const handleSendMessage = (text) => {
        if (onSendMessage) {
            onSendMessage(text);
        }
    };
    const handleModeChange = (newMode) => {
        setMode(newMode);
        if (onModeChange) {
            onModeChange(newMode);
        }
    };
    return (React.createElement(Box, { flexDirection: "column", height: "100%", padding: 1 },
        React.createElement(Box, { marginBottom: 1, justifyContent: "space-between", borderStyle: "single", borderColor: "blue", paddingX: 1 },
            React.createElement(Box, null,
                React.createElement(Text, { bold: true, color: "blue" }, "CHIMERA "),
                React.createElement(Text, { dimColor: true }, "v0.0.1")),
            React.createElement(Box, null,
                React.createElement(Text, null, "Session: "),
                React.createElement(Text, { bold: true, color: "cyan" }, "active"))),
        React.createElement(Box, { flexGrow: 1 },
            React.createElement(Box, { flexDirection: "column", width: "65%", marginRight: 1 },
                React.createElement(Box, { flexGrow: 1, borderStyle: "round", borderColor: "white", paddingX: 1 },
                    React.createElement(Chat, { messages: messages })),
                React.createElement(Box, { marginTop: 1 },
                    React.createElement(Input, { onSubmit: handleSendMessage }))),
            React.createElement(Box, { flexDirection: "column", width: "35%" },
                React.createElement(ModeSelector, { currentMode: mode, onModeChange: handleModeChange }),
                React.createElement(Box, { marginTop: 1 },
                    React.createElement(AgentDashboard, { agents: agents })),
                React.createElement(Box, { marginTop: 1 },
                    React.createElement(CostTracker, { data: costData })),
                React.createElement(Box, { marginTop: 1, flexGrow: 1 },
                    React.createElement(EventLog, { events: events, maxVisible: 10 })))),
        React.createElement(Box, { marginTop: 1, justifyContent: "space-between" },
            React.createElement(Text, { dimColor: true }, "\u2191\u2193 Navigate | Enter Select | Ctrl+C Exit"),
            React.createElement(Text, { color: "gray" },
                "Mode: ",
                mode.toUpperCase()))));
};
//# sourceMappingURL=tui.js.map