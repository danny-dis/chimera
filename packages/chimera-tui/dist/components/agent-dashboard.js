import React from 'react';
import { Box, Text } from 'ink';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';
const AgentRow = ({ agent, contentWidth }) => {
    const roleColor = zen.role[agent.role] ?? 'white';
    const status = statusSymbols[agent.status];
    const showDetails = !contentWidth || contentWidth >= 30;
    const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
    const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';
    return (React.createElement(Box, null,
        React.createElement(Text, { color: status.color },
            status.symbol,
            " "),
        React.createElement(Text, { bold: true, color: roleColor }, showDetails ? agent.role.padEnd(14) : agent.role),
        showDetails && React.createElement(Text, { dimColor: true }, agent.model),
        showDetails && tokenStr && React.createElement(Text, { dimColor: true },
            " ",
            tokenStr),
        agent.progress !== undefined && (React.createElement(Text, { color: "cyan" },
            " [",
            Math.round(agent.progress * 100),
            "%]"))));
};
/** Full panel version (used as overlay). */
export const AgentDashboard = ({ agents, contentWidth }) => {
    const running = agents.filter((a) => a.status === 'running').length;
    const completed = agents.filter((a) => a.status === 'completed').length;
    const errored = agents.filter((a) => a.status === 'error').length;
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: "cyan", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "cyan" }, contentWidth && contentWidth < 25 ? 'Agents' : 'Agent Dashboard'),
            React.createElement(Text, { dimColor: true },
                ' ',
                "(",
                agents.length,
                running > 0 ? `, ${running} run` : '',
                completed > 0 ? `, ${completed} done` : '',
                errored > 0 ? `, ${errored} err` : '',
                ")")),
        agents.length === 0 && React.createElement(Text, { dimColor: true }, "No active agents"),
        agents.map((agent) => (React.createElement(AgentRow, { key: agent.id, agent: agent, contentWidth: contentWidth })))));
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