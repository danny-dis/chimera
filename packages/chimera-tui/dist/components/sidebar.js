import React from 'react';
import { Box, Text } from 'ink';
import { zen, roleColors } from '../theme.js';
import { formatCost, statusSymbols } from './tui-utils.js';
import { ModeSelector } from './mode-selector.js';
import { PresetSelector } from './preset-selector.js';
const Section = ({ label, color = zen.fg, children, }) => (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
    React.createElement(Text, { bold: true, color: color }, label),
    children));
export const Sidebar = ({ sessionId, mode, preset, agents, costData, tokenUsage, instructions, contentWidth, onModeChange, onPresetChange, skillModel, }) => {
    const totalTokens = tokenUsage?.total
        ?? agents.reduce((sum, a) => sum + a.tokenUsage.input + a.tokenUsage.output, 0);
    const inputTokens = tokenUsage?.input
        ?? agents.reduce((sum, a) => sum + a.tokenUsage.input, 0);
    const outputTokens = tokenUsage?.output
        ?? agents.reduce((sum, a) => sum + a.tokenUsage.output, 0);
    const usagePercent = costData.budget > 0
        ? Math.round((costData.currentCost / costData.budget) * 100)
        : 0;
    const usageColor = usagePercent > 90 ? zen.error : usagePercent > 70 ? zen.warning : zen.success;
    const truncate = (s, max) => contentWidth && s.length > max ? s.slice(0, max - 1) + '…' : s;
    return (React.createElement(Box, { flexDirection: "column", paddingX: 1 },
        React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true, color: zen.accent }, "CHIMERA"),
            React.createElement(Text, { dimColor: true }, sessionId)),
        React.createElement(Section, { label: "Mode", color: zen.accent },
            React.createElement(ModeSelector, { mode: mode, compact: true, focused: true, onSelect: onModeChange, skillModel: skillModel })),
        React.createElement(Section, { label: "Preset", color: zen.agent },
            React.createElement(PresetSelector, { preset: preset, compact: true, focused: true, onSelect: onPresetChange, skillModel: skillModel })),
        React.createElement(Section, { label: "Token Usage", color: zen.info },
            React.createElement(Text, null,
                totalTokens.toLocaleString(),
                " tokens"),
            React.createElement(Text, { dimColor: true },
                inputTokens.toLocaleString(),
                " in \u00B7 ",
                outputTokens.toLocaleString(),
                " out"),
            React.createElement(Text, { color: usageColor },
                '█'.repeat(Math.min(10, Math.round(usagePercent / 10))),
                '░'.repeat(Math.max(0, 10 - Math.round(usagePercent / 10))),
                " ",
                usagePercent,
                "% budget"),
            React.createElement(Text, { dimColor: true },
                formatCost(costData.currentCost),
                " spent")),
        instructions && instructions.length > 0 && (React.createElement(Section, { label: "Instructions" }, instructions.map((file, i) => (React.createElement(Box, { key: i },
            React.createElement(Text, { color: zen.success }, "\u25CF "),
            React.createElement(Text, null, truncate(file, (contentWidth ?? 40) - 4))))))),
        React.createElement(Section, { label: "Agents" },
            agents.length === 0 && React.createElement(Text, { dimColor: true }, "No active agents"),
            agents.map((agent) => {
                const st = statusSymbols[agent.status];
                const roleColor = roleColors(agent.role);
                return (React.createElement(Box, { key: agent.id },
                    React.createElement(Text, { color: st.color },
                        "[",
                        st.symbol,
                        "] "),
                    React.createElement(Text, { bold: true, color: roleColor }, agent.role),
                    React.createElement(Text, { dimColor: true },
                        " \u2014 ",
                        agent.status)));
            })),
        React.createElement(Section, { label: "Capabilities" }, ['writer', 'reviewer', 'challenger', 'synthesizer'].map((r) => (React.createElement(Box, { key: r },
            React.createElement(Text, { color: roleColors(r) }, "\u25CF "),
            React.createElement(Text, { bold: true, color: roleColors(r) }, r),
            React.createElement(Text, { dimColor: true },
                " \u00B7 ",
                r === 'writer' ? 'implements' : r === 'reviewer' ? 'verifies' : r === 'challenger' ? 'attacks' : 'merges')))))));
};
//# sourceMappingURL=sidebar.js.map