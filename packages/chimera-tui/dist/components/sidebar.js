import React from 'react';
import { Box, Text } from 'ink';
import { zen } from '../theme.js';
import { formatCost, statusSymbols } from './tui-utils.js';
const modes = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];
const presets = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];
const modeIcons = {
    ask: '?', plan: '◈', code: '⚡', debug: '◉', review: '◎', oal: '◆', auto: '⟳',
};
const presetIcons = {
    solo: '●', duo: '◉', trio: '◎', merge: '⬡', hive: '⬡', fusion: '◆', swarm: '🐝', auto: '⚡',
};
const Section = ({ label, color = zen.fg, children, }) => (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
    React.createElement(Text, { bold: true, color: color }, label),
    children));
export const Sidebar = ({ sessionId, mode, preset, agents, costData, tokenUsage, workingDir, instructions, contentWidth, }) => {
    const totalTokens = tokenUsage?.total
        ?? agents.reduce((sum, a) => sum + a.tokenUsage.input + a.tokenUsage.output, 0);
    const usagePercent = costData.budget > 0
        ? Math.round((costData.currentCost / costData.budget) * 100)
        : 0;
    const truncate = (s, max) => contentWidth && s.length > max ? s.slice(0, max - 1) + '…' : s;
    return (React.createElement(Box, { flexDirection: "column", paddingX: 1 },
        React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true, color: zen.info }, "CHIMERA "),
            React.createElement(Text, { dimColor: true }, sessionId)),
        React.createElement(Section, { label: "Mode", color: zen.accent },
            React.createElement(Box, { flexDirection: "row", flexWrap: "wrap" }, modes.map((m) => {
                const sel = m === mode;
                return (React.createElement(Box, { key: m, marginRight: 1 },
                    React.createElement(Text, { color: sel ? zen.accent : zen.muted, bold: sel },
                        sel ? '▸ ' : '  ',
                        modeIcons[m],
                        " ",
                        m)));
            }))),
        React.createElement(Section, { label: "Preset", color: "magenta" },
            React.createElement(Box, { flexDirection: "row", flexWrap: "wrap" }, presets.map((p) => {
                const sel = p === preset;
                return (React.createElement(Box, { key: p, marginRight: 1 },
                    React.createElement(Text, { color: sel ? 'magenta' : zen.muted, bold: sel },
                        sel ? '▸ ' : '  ',
                        presetIcons[p],
                        " ",
                        p)));
            }))),
        React.createElement(Section, { label: "Context" },
            React.createElement(Text, null,
                totalTokens.toLocaleString(),
                " tokens"),
            React.createElement(Text, null,
                usagePercent,
                "% used"),
            React.createElement(Text, null,
                formatCost(costData.currentCost),
                " spent")),
        workingDir && (React.createElement(Section, { label: "Working Directory" },
            React.createElement(Text, null, truncate(workingDir, (contentWidth ?? 40) - 2)))),
        instructions && instructions.length > 0 && (React.createElement(Section, { label: "Instructions" }, instructions.map((file, i) => (React.createElement(Box, { key: i },
            React.createElement(Text, { color: zen.success }, "\u25CF "),
            React.createElement(Text, null, truncate(file, (contentWidth ?? 40) - 4))))))),
        React.createElement(Section, { label: "Tasks" },
            agents.length === 0 && React.createElement(Text, { dimColor: true }, "No active tasks"),
            agents.map((agent) => {
                const st = statusSymbols[agent.status];
                const roleColor = zen.role[agent.role] ?? zen.fg;
                return (React.createElement(Box, { key: agent.id },
                    React.createElement(Text, { color: st.color },
                        "[",
                        st.symbol,
                        "] "),
                    React.createElement(Text, { bold: true, color: roleColor }, agent.role),
                    React.createElement(Text, { dimColor: true },
                        " \u2014 ",
                        agent.status)));
            }))));
};
//# sourceMappingURL=sidebar.js.map