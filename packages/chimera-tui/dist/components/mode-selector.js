import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { zen, MODES, MODE_META, tiered } from '../theme.js';
export const ModeSelector = ({ mode, onSelect, focused = false, compact = false, contentWidth, skillModel, }) => {
    const [navIndex, setNavIndex] = useState(() => Math.max(0, MODES.indexOf(mode)));
    const selectMode = useCallback((index) => {
        const m = MODES[index];
        if (m && onSelect)
            onSelect(m);
    }, [onSelect]);
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
                const next = Math.min(MODES.length - 1, prev + 1);
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
        return (React.createElement(Box, { flexWrap: "wrap" }, MODES.map((m) => {
            const sel = m === mode;
            return (React.createElement(Box, { key: m, marginRight: 1 },
                React.createElement(Text, { color: sel ? zen.accent : zen.muted, bold: sel, underline: sel },
                    MODE_META[m].icon,
                    " ",
                    m)));
        })));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: zen.accent, paddingX: 1 },
        React.createElement(Text, { bold: true, color: zen.accent }, "Mode"),
        MODES.map((m) => {
            const isSelected = m === mode;
            return (React.createElement(Box, { key: m },
                React.createElement(Text, { color: isSelected ? zen.accent : zen.muted }, isSelected ? '▸ ' : '  '),
                React.createElement(Text, { bold: isSelected, color: isSelected ? zen.accent : zen.fg },
                    MODE_META[m].icon,
                    " ",
                    m),
                React.createElement(Text, { dimColor: true }, (!contentWidth || contentWidth >= 35) ? ` — ${tiered(MODE_META[m].desc, skillModel).slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : '')));
        })));
};
//# sourceMappingURL=mode-selector.js.map