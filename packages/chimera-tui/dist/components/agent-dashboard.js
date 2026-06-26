import React from 'react';
import { Box, Text } from 'ink';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';
const AgentRow = ({ agent }) => {
    const roleColor = zen.role[agent.role] ?? 'white';
    const status = statusSymbols[agent.status];
    const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
    const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';
    return (React.createElement(Box, null,
        React.createElement(Text, { color: status.color },
            status.symbol,
            " "),
        React.createElement(Text, { bold: true, color: roleColor }, agent.role.padEnd(14)),
        React.createElement(Text, { dimColor: true }, agent.model),
        tokenStr && React.createElement(Text, { dimColor: true },
            " ",
            tokenStr),
        agent.progress !== undefined && (React.createElement(Text, { color: "cyan" },
            " [",
            Math.round(agent.progress * 100),
            "%]"))));
};
/** Full panel version (used as overlay). */
export const AgentDashboard = ({ agents }) => {
    const running = agents.filter((a) => a.status === 'running').length;
    const completed = agents.filter((a) => a.status === 'completed').length;
    const errored = agents.filter((a) => a.status === 'error').length;
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: "cyan", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "cyan" }, "Agent Dashboard"),
            React.createElement(Text, { dimColor: true },
                ' ',
                "(",
                agents.length,
                " total, ",
                running,
                " running, ",
                completed,
                " done",
                errored > 0 ? `, ${errored} errors` : '',
                ")")),
        agents.length === 0 && React.createElement(Text, { dimColor: true }, "No active agents"),
        agents.map((agent) => (React.createElement(AgentRow, { key: agent.id, agent: agent })))));
};
/** Compact single-line version (used in status bar). */
export const AgentStatusLine = ({ agents }) => {
    if (agents.length === 0)
        return null;
    return (React.createElement(Box, null, agents.map((agent) => {
        const st = statusSymbols[agent.status] ?? statusSymbols.pending;
        return (React.createElement(Box, { key: agent.id, marginRight: 1 },
            React.createElement(Text, { color: st.color }, st.symbol),
            React.createElement(Text, { dimColor: true },
                " ",
                agent.role,
                " ")));
    })));
};
//# sourceMappingURL=agent-dashboard.js.map