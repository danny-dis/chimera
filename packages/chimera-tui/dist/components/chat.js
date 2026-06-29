import React from 'react';
import { Box, Text } from 'ink';
import { Viewport } from './viewport.js';
import { Markdown } from './markdown.js';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';
const ToolCallBadge = ({ indicator }) => {
    const st = statusSymbols[indicator.status];
    const statusSymbol = st.symbol;
    const statusColor = st.color;
    return (React.createElement(Box, { marginLeft: 2, marginTop: 0 },
        React.createElement(Text, { color: statusColor },
            statusSymbol,
            " ",
            indicator.name),
        indicator.args && React.createElement(Text, { dimColor: true },
            " ",
            indicator.args.slice(0, 60)),
        indicator.status === 'error' && indicator.result && (React.createElement(Text, { color: zen.error },
            " ",
            indicator.result.slice(0, 60)))));
};
const AnalysisSection = ({ analysis }) => {
    if (!analysis)
        return null;
    const summaryParts = [];
    if (analysis.consensus.length > 0) {
        summaryParts.push(`Consensus: ${analysis.consensus.length}`);
    }
    if (analysis.conflicts.length > 0) {
        summaryParts.push(`Conflicts: ${analysis.conflicts.length}`);
    }
    if (analysis.uniqueInsights.length > 0) {
        summaryParts.push(`Insights: ${analysis.uniqueInsights.length}`);
    }
    return (React.createElement(Box, { marginTop: 1, flexDirection: "column" },
        React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: zen.warning }, "\uD83D\uDCCA Analysis"),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: analysis.confidence > 0.7 ? zen.success : zen.warning },
                (analysis.confidence * 100).toFixed(0),
                "%"),
            summaryParts.length > 0 && (React.createElement(Text, { dimColor: true },
                " \u2014 ",
                summaryParts.join(', ')))),
        analysis.thought && (React.createElement(Text, { dimColor: true, italic: true },
            "  ",
            analysis.thought.slice(0, 120),
            analysis.thought.length > 120 ? '…' : ''))));
};
const MessageBubble = ({ message, isSelected }) => {
    const prefix = message.role === 'user' ? 'You' :
        message.role === 'system' ? 'System' :
            'Assistant';
    const color = message.role === 'user' ? zen.accent :
        message.role === 'system' ? zen.muted :
            zen.success;
    const isSystem = message.role === 'system';
    return (React.createElement(Box, { flexDirection: "column", marginBottom: isSystem ? 0 : 1 },
        React.createElement(Box, null,
            React.createElement(Text, { inverse: isSelected }, isSelected ? '▸' : ' '),
            React.createElement(Text, { bold: true, color: color },
                ' ',
                prefix,
                ":"),
            React.createElement(Text, { dimColor: true },
                " ",
                new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))),
        React.createElement(Box, { marginLeft: 2, flexDirection: "column", width: "100%" },
            isSystem ? (React.createElement(Text, { dimColor: true }, message.content)) : (React.createElement(Markdown, { content: message.content })),
            message.streaming && React.createElement(Text, { dimColor: true }, "\u258A"),
            message.toolCalls?.map((tc, i) => (React.createElement(ToolCallBadge, { key: i, indicator: tc }))),
            message.analysis && React.createElement(AnalysisSection, { analysis: message.analysis }))));
};
export const Chat = ({ messages, focused = false, height = 20 }) => {
    return (React.createElement(Box, { flexDirection: "column", height: height, overflow: "hidden" },
        messages.length === 0 && (React.createElement(Box, { flexDirection: "column", paddingX: 2, paddingY: 1 },
            React.createElement(Text, { bold: true, color: zen.accent }, "Chimera"),
            React.createElement(Text, { dimColor: true }, "Terminal-native parallel multi-agent coding platform."),
            React.createElement(Text, { dimColor: true }, "Type a task or /help for commands."))),
        React.createElement(Viewport, { items: messages, height: height, focused: focused, renderItem: (msg, _index, isSelected) => (React.createElement(MessageBubble, { message: msg, isSelected: isSelected })) })));
};
//# sourceMappingURL=chat.js.map