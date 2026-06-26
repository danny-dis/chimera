import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { zen } from '../theme.js';
const modes = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];
const modeIcons = {
    ask: '?',
    plan: '◈',
    code: '⚡',
    debug: '◉',
    review: '◎',
    oal: '◆',
    auto: '⟳',
};
const modeDescriptions = {
    ask: 'Quick Q&A',
    plan: 'Plan changes',
    code: 'Write code',
    debug: 'Debug issues',
    review: 'Review code',
    oal: 'OAL mode',
    auto: 'Auto-select mode',
};
export const ModeSelector = ({ currentMode, onModeChange, focused = false, compact = false, }) => {
    const [navIndex, setNavIndex] = useState(() => modes.indexOf(currentMode));
    const selectMode = useCallback((index) => {
        const mode = modes[index];
        if (mode && onModeChange) {
            onModeChange(mode);
        }
    }, [onModeChange]);
    useInput((_input, key) => {
        if (!focused)
            return;
        if (key.leftArrow) {
            setNavIndex((prev) => {
                const next = Math.max(0, prev - 1);
                selectMode(next);
                return next;
            });
            return;
        }
        if (key.rightArrow) {
            setNavIndex((prev) => {
                const next = Math.min(modes.length - 1, prev + 1);
                selectMode(next);
                return next;
            });
            return;
        }
        if (key.return) {
            selectMode(navIndex);
            return;
        }
    });
    if (compact) {
        return (React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: focused ? zen.accent : 'dimColor' },
                "Mode",
                ' '),
            modes.map((mode) => (React.createElement(Box, { key: mode, marginRight: 1 },
                React.createElement(Text, { color: mode === currentMode ? zen.accent : zen.muted, bold: mode === currentMode, underline: mode === currentMode },
                    modeIcons[mode],
                    " ",
                    mode))))));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: zen.accent, paddingX: 1 },
        React.createElement(Text, { bold: true, color: zen.accent }, "Mode"),
        modes.map((mode) => {
            const isSelected = mode === currentMode;
            return (React.createElement(Box, { key: mode },
                React.createElement(Text, { color: isSelected ? zen.accent : zen.muted }, isSelected ? '▸ ' : '  '),
                React.createElement(Text, { bold: isSelected, color: isSelected ? zen.accent : zen.fg },
                    modeIcons[mode],
                    " ",
                    mode),
                React.createElement(Text, { dimColor: true },
                    " \u2014 ",
                    modeDescriptions[mode])));
        })));
};
//# sourceMappingURL=mode-selector.js.map