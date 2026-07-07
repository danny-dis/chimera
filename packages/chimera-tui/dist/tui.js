import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { zen } from './theme.js';
import { useFocus } from './hooks/use-focus.js';
import { runCommand, autocompleteCommand } from './commands/commands.js';
export const TUI = ({ mode: initialMode = 'code', preset: initialPreset = 'solo', sessionId = 'active', messages: initialMessages = [], agents: initialAgents = [], costData: initialCostData = { currentCost: 0, budget: 10, breakdown: [] }, sessions = [], diffFiles = [], events: initialEvents = [], activeTool, workingDir, instructions, tokenUsage, onSendMessage, onModeChange, onPresetChange, onSessionSelect, onSessionDelete, onExit, }) => {
    const [messages, setMessages] = useState(initialMessages);
    const [agents, setAgents] = useState(initialAgents);
    const [costData, setCostData] = useState(initialCostData);
    const [events, setEvents] = useState(initialEvents);
    const [mode, setMode] = useState(initialMode);
    const [preset, setPreset] = useState(initialPreset);
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [activeOverlay, setActiveOverlay] = useState(null);
    const [commandHistory, setCommandHistory] = useState([]);
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
    // Derive token usage from agents when the host doesn't supply it.
    const derivedTokenUsage = useMemo(() => {
        if (tokenUsage)
            return tokenUsage;
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
    });
    if (!layout.isMinSize) {
        return (React.createElement(Box, { flexDirection: "column", alignItems: "center", justifyContent: "center", height: layout.height },
            React.createElement(Text, { bold: true, color: zen.accent }, "CHIMERA"),
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
            React.createElement(StatusBar, { mode: mode, costData: costData, agents: agents, activeTool: activeTool, sidebarVisible: sidebarVisible, workingDir: workingDir })),
        React.createElement(Box, { flexDirection: "row", flexGrow: 1, padding: 1 },
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                activeOverlay === 'sessions' ? (React.createElement(SessionBrowser, { sessions: sessions, onSelect: onSessionSelect, onDelete: onSessionDelete })) : activeOverlay === 'diff' ? (React.createElement(DiffViewer, { files: diffFiles })) : activeOverlay === 'agents' ? (React.createElement(AgentDashboard, { agents: agents })) : activeOverlay === 'events' ? (React.createElement(Box, { flexGrow: 1, borderStyle: "round", borderColor: zen.border },
                    React.createElement(EventLog, { events: events, height: chatHeight }))) : (React.createElement(Box, { flexGrow: 1, borderStyle: "round", borderColor: zen.border, paddingX: 1 },
                    React.createElement(Chat, { messages: messages, focused: focus.isFocused(1), height: chatHeight, width: layout.chatWidth }))),
                React.createElement(Box, { marginTop: 1, height: inputHeight },
                    React.createElement(Input, { onSubmit: handleSendMessage, autocomplete: autocompleteCommand, disabled: activeOverlay !== null })),
                messages.length === 0 && activeOverlay === null && (React.createElement(Box, { marginTop: 1 },
                    React.createElement(Text, { dimColor: true },
                        "Tip: type a task, run ",
                        React.createElement(Text, { color: zen.accent }, "/help"),
                        " for commands,",
                        ' ',
                        React.createElement(Text, { color: zen.accent }, "Ctrl+B"),
                        " toggles the sidebar,",
                        ' ',
                        React.createElement(Text, { color: zen.accent }, "/agents"),
                        " ",
                        React.createElement(Text, { color: zen.accent }, "/events"),
                        " ",
                        React.createElement(Text, { color: zen.accent }, "/diff"),
                        " for details.")))),
            sidebarVisible && (React.createElement(Box, { flexDirection: "column", width: layout.sidebarWidth, marginLeft: 1, borderStyle: "single", borderColor: zen.border },
                React.createElement(Sidebar, { sessionId: sessionId, mode: mode, preset: preset, agents: agents, costData: costData, tokenUsage: derivedTokenUsage, workingDir: workingDir, instructions: instructions, contentWidth: layout.sidebarContentWidth, onModeChange: handleModeChange, onPresetChange: handlePresetChange })))),
        React.createElement(Box, { height: footerHeight, justifyContent: "space-between", borderStyle: "single", borderColor: zen.border, paddingX: 1 },
            React.createElement(Text, { dimColor: true },
                React.createElement(Text, { color: zen.accent }, "Ctrl+B"),
                " Sidebar \u00B7 ",
                React.createElement(Text, { color: zen.accent }, "Tab"),
                " Focus \u00B7",
                React.createElement(Text, { color: zen.accent }, "/help"),
                " \u00B7 ",
                React.createElement(Text, { color: zen.accent }, "/agents"),
                " ",
                React.createElement(Text, { color: zen.accent }, "/events"),
                " ",
                React.createElement(Text, { color: zen.accent }, "/diff"),
                " \u00B7",
                React.createElement(Text, { color: zen.accent }, "Esc"),
                " Close \u00B7 ",
                React.createElement(Text, { color: zen.accent }, "Ctrl+C"),
                " Exit"),
            React.createElement(Text, { dimColor: true },
                "Session: ",
                sessionId))));
};
//# sourceMappingURL=tui.js.map