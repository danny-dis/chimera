import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { zen, PRESETS, PRESET_META, tiered } from '../theme.js';
export const PresetSelector = ({ preset, onSelect, focused = false, compact = false, contentWidth, skillModel, }) => {
    const [navIndex, setNavIndex] = useState(() => Math.max(0, PRESETS.indexOf(preset)));
    const selectPreset = useCallback((index) => {
        const p = PRESETS[index];
        if (p && onSelect)
            onSelect(p);
    }, [onSelect]);
    useInput((_input, key) => {
        if (!focused)
            return;
        if (key.leftArrow) {
            setNavIndex((prev) => {
                const next = Math.max(0, prev - 1);
                selectPreset(next);
                return next;
            });
            return;
        }
        if (key.rightArrow) {
            setNavIndex((prev) => {
                const next = Math.min(PRESETS.length - 1, prev + 1);
                selectPreset(next);
                return next;
            });
            return;
        }
        if (key.return) {
            selectPreset(navIndex);
            return;
        }
    });
    if (compact) {
        return (React.createElement(Box, { flexWrap: "wrap" }, PRESETS.map((p) => {
            const sel = p === preset;
            return (React.createElement(Box, { key: p, marginRight: 1 },
                React.createElement(Text, { color: sel ? zen.agent : zen.muted, bold: sel, underline: sel },
                    PRESET_META[p].icon,
                    " ",
                    p)));
        })));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: zen.agent, paddingX: 1 },
        React.createElement(Text, { bold: true, color: zen.agent }, "Preset"),
        PRESETS.map((p) => {
            const isSelected = p === preset;
            return (React.createElement(Box, { key: p },
                React.createElement(Text, { color: isSelected ? zen.agent : zen.muted }, isSelected ? '▸ ' : '  '),
                React.createElement(Text, { bold: isSelected, color: isSelected ? zen.agent : zen.fg },
                    PRESET_META[p].icon,
                    " ",
                    p),
                React.createElement(Text, { dimColor: true }, (!contentWidth || contentWidth >= 35) ? ` — ${tiered(PRESET_META[p].desc, skillModel).slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : '')));
        })));
};
//# sourceMappingURL=preset-selector.js.map