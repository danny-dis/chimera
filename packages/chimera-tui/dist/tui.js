import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Chat } from './components/chat.js';
import { Input } from './components/input.js';
import { Sidebar } from './components/sidebar.js';
import { AgentDashboard } from './components/agent-dashboard.js';
import { EventLog } from './components/event-log.js';
import { StatusBar } from './components/status-bar.js';
import { SessionBrowser } from './components/session-browser.js';
import { DiffViewer } from './components/diff-viewer.js';
import { useLayout } from './hooks/use-layout.js';
import { useFocus } from './hooks/use-focus.js';
import { runCommand, autocompleteCommand } from './commands/commands.js';
export const TUI = ({ mode: initialMode = 'code', preset: initialPreset = 'solo', sessionId = 'active', messages: initialMessages = [], agents: initialAgents = [], costData: initialCostData = { currentCost: 0, budget: 10, breakdown: [] }, sessions = [], diffFiles = [], events: initialEvents = [], activeTool, workingDir, instructions, tokenUsage, onSendMessage, onModeChange, onPresetChange, onSessionSelect, onSessionDelete, onExit, }) => {
    const [messages, setMessages] = useState(initialMessages);
    const [agents, setAgents] = useState(initialAgents);
    const [costData, setCostData] = useState(initialCostData);
    const [events, setEvents] = useState(initialEvents);
    const [mode, setMode] = useState(initialMode);
    const [preset, setPreset] = useState(initialPreset);
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const [activeOverlay, setActiveOverlay] = useState(null);
    const [commandHistory, setCommandHistory] = useState([]);
    const layout = useLayout(sidebarVisible);
    const focus = useFocus();
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
    useEffect(() => {
        setPreset(initialPreset);
    }, [initialPreset]);
    const buildCommandContext = useCallback(() => ({
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
    const handleSlashCommand = useCallback((text) => {
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
            const sysMsg = {
                id: `cmd-${Date.now()}`,
                role: 'system',
                content: result.output.join('\n'),
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, sysMsg]);
        }
        setCommandHistory((prev) => [...prev, text]);
    }, [buildCommandContext, onExit]);
    const handleSendMessage = useCallback((text) => {
        if (text.startsWith('/')) {
            handleSlashCommand(text);
            return;
        }
        onSendMessage?.(text);
    }, [handleSlashCommand, onSendMessage]);
    const handleModeChange = useCallback((newMode) => {
        setMode(newMode);
        onModeChange?.(newMode);
    }, [onModeChange]);
    const handlePresetChange = useCallback((newPreset) => {
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
        return (React.createElement(Box, { flexDirection: "column", alignItems: "center", justifyContent: "center", height: layout.height },
            React.createElement(Text, { bold: true, color: "cyan" }, "CHIMERA"),
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, { dimColor: true }, "Terminal too small. Resize to at least 80x24.")),
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, { dimColor: true },
                    "Current: ",
                    layout.width,
                    "x",
                    layout.height))));
    }
    const statusBarHeight = 1;
    const footerHeight = 2;
    const inputHeight = 3;
    const chatHeight = layout.height - statusBarHeight - footerHeight - inputHeight - 2;
    return (React.createElement(Box, { flexDirection: "column", height: layout.height },
        React.createElement(Box, { height: statusBarHeight },
            React.createElement(StatusBar, { mode: mode, costData: costData, agents: agents, activeTool: activeTool, sidebarVisible: sidebarVisible })),
        React.createElement(Box, { flexDirection: "row", flexGrow: 1, padding: 1 },
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                activeOverlay === 'sessions' ? (React.createElement(SessionBrowser, { sessions: sessions, onSelect: onSessionSelect, onDelete: onSessionDelete })) : activeOverlay === 'diff' ? (React.createElement(DiffViewer, { files: diffFiles })) : activeOverlay === 'agents' ? (React.createElement(AgentDashboard, { agents: agents })) : activeOverlay === 'events' ? (React.createElement(Box, { flexGrow: 1, borderStyle: "round", borderColor: "gray" },
                    React.createElement(EventLog, { events: events, height: chatHeight }))) : (React.createElement(Box, { flexGrow: 1, borderStyle: "round", borderColor: "gray", paddingX: 1 },
                    React.createElement(Chat, { messages: messages, focused: focus.isFocused(1), height: chatHeight }))),
                React.createElement(Box, { marginTop: 1, height: inputHeight },
                    React.createElement(Input, { onSubmit: handleSendMessage, autocomplete: autocompleteCommand, disabled: activeOverlay !== null }))),
            sidebarVisible && (React.createElement(Box, { flexDirection: "column", width: layout.sidebarWidth, marginLeft: 1, borderStyle: "single", borderColor: "gray" },
                React.createElement(Sidebar, { sessionId: sessionId, mode: mode, preset: preset, agents: agents, costData: costData, tokenUsage: tokenUsage, workingDir: workingDir, instructions: instructions, contentWidth: layout.sidebarContentWidth, onModeChange: handleModeChange, onPresetChange: handlePresetChange })))),
        React.createElement(Box, { height: footerHeight, justifyContent: "space-between", borderStyle: "single", borderColor: "gray", paddingX: 1 },
            React.createElement(Text, { dimColor: true }, "Ctrl+B Sidebar | Ctrl+C Exit"),
            React.createElement(Text, { dimColor: true },
                "Session: ",
                sessionId))));
};
//# sourceMappingURL=tui.js.map