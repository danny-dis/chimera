import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { createRequire } from 'node:module';
import Spinner from 'ink-spinner';
import { statusSymbols, formatTime } from './tui-utils.js';
import { zen, MODE_META } from '../theme.js';
// ── Version (read at module load so the bar always matches package.json) ──
const require = createRequire(import.meta.url);
const CHIMERA_VERSION = (() => {
    try {
        return require('../../package.json').version;
    }
    catch {
        return '0.0.0';
    }
})();
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
export const StatusBar = ({ mode, agents, activeTool, sidebarVisible = false, }) => {
    return (React.createElement(Box, { borderStyle: "single", borderColor: zen.border, paddingX: 1, justifyContent: "space-between" },
        React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { bold: true, color: zen.info }, "CHIMERA"),
            React.createElement(Text, { dimColor: true },
                " v",
                CHIMERA_VERSION),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: zen.accent, bold: true },
                MODE_META[mode]?.icon ?? '?',
                " ",
                mode)),
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