import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { zen } from '../theme.js';
const presets = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];
const presetIcons = {
    solo: '●',
    duo: '◉',
    trio: '◎',
    merge: '⬡',
    hive: '⬡',
    fusion: '◆',
    swarm: '🐝',
    auto: '⚡',
};
const presetDescriptions = {
    solo: 'Single agent',
    duo: 'Two agents',
    trio: 'Three agents',
    merge: 'Merge multiple agent outputs',
    hive: 'Decompose & parallel subtasks',
    fusion: 'Multi-model fusion',
    swarm: 'Autonomous swarm orchestration',
    auto: 'Automatic selection',
};
export const PresetSelector = ({ currentPreset, onPresetChange, focused = false, compact = false, contentWidth, }) => {
    const [navIndex, setNavIndex] = useState(() => presets.indexOf(currentPreset));
    const selectPreset = useCallback((index) => {
        const preset = presets[index];
        if (preset && onPresetChange) {
            onPresetChange(preset);
        }
    }, [onPresetChange]);
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
                const next = Math.min(presets.length - 1, prev + 1);
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
        return (React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: focused ? 'magenta' : 'dimColor' },
                "Preset",
                ' '),
            presets.map((preset) => (React.createElement(Box, { key: preset, marginRight: 1 },
                React.createElement(Text, { color: preset === currentPreset ? 'magenta' : zen.muted, bold: preset === currentPreset, underline: preset === currentPreset },
                    presetIcons[preset],
                    " ",
                    preset))))));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "single", borderColor: "magenta", paddingX: 1 },
        React.createElement(Text, { bold: true, color: "magenta" }, "Preset"),
        presets.map((preset) => {
            const isSelected = preset === currentPreset;
            return (React.createElement(Box, { key: preset },
                React.createElement(Text, { color: isSelected ? 'magenta' : zen.muted }, isSelected ? '▸ ' : '  '),
                React.createElement(Text, { bold: isSelected, color: isSelected ? 'magenta' : zen.fg },
                    presetIcons[preset],
                    " ",
                    preset),
                React.createElement(Text, { dimColor: true }, (!contentWidth || contentWidth >= 35) ? ` — ${presetDescriptions[preset].slice(0, Math.max(0, contentWidth ? contentWidth - 12 : 30))}` : '')));
        })));
};
//# sourceMappingURL=preset-selector.js.map