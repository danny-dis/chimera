import React from 'react';
import { Box, Text } from 'ink';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';
import { AGENT_CAPABILITIES, PRESET_CAPABILITIES, getAgentCapability } from '../agent-capabilities.js';
const AgentRow = ({ agent, contentWidth }) => {
    const roleColor = zen.role[agent.role] ?? 'white';
    const status = statusSymbols[agent.status];
    const showDetails = !contentWidth || contentWidth >= 30;
    const capability = getAgentCapability(agent.role);
    const totalTokens = agent.tokenUsage.input + agent.tokenUsage.output;
    const tokenStr = totalTokens > 0 ? `${totalTokens} tok` : '';
    return (React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
        React.createElement(Box, null,
            React.createElement(Text, { color: status.color },
                status.symbol,
                " "),
            React.createElement(Text, { bold: true, color: roleColor }, showDetails ? capability.title.padEnd(13) : capability.title),
            showDetails && React.createElement(Text, { dimColor: true },
                agent.provider,
                "/",
                agent.model),
            showDetails && tokenStr && React.createElement(Text, { dimColor: true },
                " ",
                tokenStr),
            agent.progress !== undefined && (React.createElement(Text, { color: "cyan" },
                " [",
                Math.round(agent.progress * 100),
                "%]"))),
        showDetails && (React.createElement(Box, { marginLeft: 2 },
            React.createElement(Text, { dimColor: true }, capability.capability)))));
};
const CapabilityRow = ({ capability, compact, }) => {
    const roleColor = zen.role[capability.role] ?? 'white';
    return (React.createElement(Box, { flexDirection: "column", marginBottom: compact ? 0 : 1 },
        React.createElement(Box, null,
            React.createElement(Text, { color: roleColor, bold: true }, capability.title.padEnd(compact ? 0 : 13)),
            !compact && React.createElement(Text, { dimColor: true }, capability.capability)),
        !compact && (React.createElement(Box, { marginLeft: 15 },
            React.createElement(Text, { dimColor: true },
                "Outputs: ",
                capability.outputs)))));
};
/** Full panel version (used as overlay). */
export const AgentDashboard = ({ agents, contentWidth }) => {
    const running = agents.filter((a) => a.status === 'running').length;
    const completed = agents.filter((a) => a.status === 'completed').length;
    const errored = agents.filter((a) => a.status === 'error').length;
    const compact = Boolean(contentWidth && contentWidth < 48);
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: zen.borderActive, paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: zen.accent }, contentWidth && contentWidth < 25 ? 'Agents' : 'Agent Control'),
            React.createElement(Text, { dimColor: true },
                ' ',
                "(",
                agents.length,
                running > 0 ? `, ${running} run` : '',
                completed > 0 ? `, ${completed} done` : '',
                errored > 0 ? `, ${errored} err` : '',
                ")")),
        React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
            React.createElement(Text, { bold: true }, "Live agents"),
            agents.length === 0 && React.createElement(Text, { dimColor: true }, "No active agents. Capabilities remain available by preset."),
            agents.map((agent) => (React.createElement(AgentRow, { key: agent.id, agent: agent, contentWidth: contentWidth })))),
        React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
            React.createElement(Text, { bold: true }, "Role capabilities"),
            AGENT_CAPABILITIES.map((capability) => (React.createElement(CapabilityRow, { key: capability.role, capability: capability, compact: compact })))),
        !compact && (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true }, "Execution presets"),
            PRESET_CAPABILITIES.map((preset) => (React.createElement(Box, { key: preset.preset },
                React.createElement(Text, { color: zen.accent }, preset.label.padEnd(8)),
                React.createElement(Text, { dimColor: true }, preset.capability))))))));
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