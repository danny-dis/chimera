import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { statusSymbols, budgetColor, formatTime } from './tui-utils.js';
import { zen, MODE_META } from '../theme.js';
// ── Mini cost bar (10 chars wide) ───────────────────────────────────────
const MiniCostBar = ({ used, total, width = 10, }) => {
    if (total <= 0)
        return null;
    const ratio = Math.min(used / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const color = budgetColor(ratio);
    return (React.createElement(Box, null,
        React.createElement(Text, { color: color }, '█'.repeat(filled)),
        React.createElement(Text, { dimColor: true }, '░'.repeat(empty))));
};
// ── Clock ────────────────────────────────────────────────────────────────
const Clock = () => {
    const [time, setTime] = useState('');
    useEffect(() => {
        const update = () => setTime(formatTime(Date.now()));
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);
    return React.createElement(Text, { dimColor: true }, time);
};
// ── Component ────────────────────────────────────────────────────────────
export const StatusBar = ({ mode, costData, agents, activeTool, sidebarVisible = false, workingDir, }) => {
    const ratio = costData.budget > 0 ? costData.currentCost / costData.budget : 0;
    const costColor = budgetColor(ratio);
    const projectName = workingDir
        ? workingDir.split(/[/\\]/).filter(Boolean).pop() ?? 'CHIMERA'
        : 'CHIMERA';
    return (React.createElement(Box, { borderStyle: "single", borderColor: zen.border, paddingX: 1, justifyContent: "space-between" },
        React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { bold: true, color: zen.info },
                projectName,
                " "),
            React.createElement(Text, { dimColor: true }, "v0.0.1"),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: zen.accent, bold: true },
                MODE_META[mode]?.icon ?? '?',
                " ",
                mode)),
        React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { color: costColor, bold: true },
                "$",
                costData.currentCost.toFixed(4)),
            React.createElement(Text, { dimColor: true },
                " / $",
                costData.budget.toFixed(2),
                " "),
            React.createElement(MiniCostBar, { used: costData.currentCost, total: costData.budget })),
        agents.length > 0 && (React.createElement(Box, { marginRight: 1 }, agents.map((agent) => {
            const st = statusSymbols[agent.status] ?? statusSymbols.pending;
            return (React.createElement(Box, { key: agent.id, marginRight: 1 },
                React.createElement(Text, { color: st.color }, st.symbol),
                React.createElement(Text, { dimColor: true },
                    " ",
                    agent.role,
                    " ")));
        }))),
        activeTool && activeTool.status === 'running' && (React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { color: zen.warning },
                React.createElement(Spinner, { type: "dots" })),
            React.createElement(Text, { color: zen.warning },
                " ",
                activeTool.tool),
            activeTool.args && React.createElement(Text, { dimColor: true },
                " ",
                activeTool.args.slice(0, 30)))),
        activeTool && activeTool.status === 'completed' && (React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { color: zen.success }, "\u2713"),
            React.createElement(Text, { dimColor: true },
                " ",
                activeTool.tool))),
        activeTool && activeTool.status === 'error' && (React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { color: zen.error }, "\u2717"),
            React.createElement(Text, { dimColor: true },
                " ",
                activeTool.tool))),
        React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { dimColor: true }, sidebarVisible ? '◧' : '◨')),
        React.createElement(Clock, null)));
};
//# sourceMappingURL=status-bar.js.map