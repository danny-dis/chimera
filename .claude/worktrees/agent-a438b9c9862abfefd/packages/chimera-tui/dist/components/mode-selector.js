import React from 'react';
import { Box, Text } from 'ink';
const modes = ['ask', 'plan', 'code', 'debug', 'review'];
const modeIcons = {
    ask: '?',
    plan: '◈',
    code: '⚡',
    debug: '◉',
    review: '◎',
    oal: '◆',
};
const modeDescriptions = {
    ask: 'Quick Q&A',
    plan: 'Plan changes',
    code: 'Write code',
    debug: 'Debug issues',
    review: 'Review code',
    oal: 'OAL mode',
};
export const ModeSelector = ({ currentMode, onModeChange: _onModeChange, compact = false, }) => {
    if (compact) {
        return (React.createElement(Box, null, modes.map((mode) => (React.createElement(Box, { key: mode, marginRight: 1 },
            React.createElement(Text, { color: mode === currentMode ? 'cyan' : 'gray', bold: mode === currentMode, underline: mode === currentMode },
                modeIcons[mode],
                " ",
                mode))))));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "cyan" }, "Mode")),
        React.createElement(Box, { flexDirection: "column" }, modes.map((mode) => {
            const isSelected = mode === currentMode;
            return (React.createElement(Box, { key: mode },
                React.createElement(Text, { color: isSelected ? 'cyan' : 'gray' }, isSelected ? '▸ ' : '  '),
                React.createElement(Text, { bold: isSelected, color: isSelected ? 'cyan' : 'white' },
                    modeIcons[mode],
                    " ",
                    mode),
                React.createElement(Text, { dimColor: true },
                    " \u2014 ",
                    modeDescriptions[mode])));
        }))));
};
//# sourceMappingURL=mode-selector.js.map