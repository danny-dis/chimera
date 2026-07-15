import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { Viewport } from './viewport.js';
import { Markdown } from './markdown.js';
import { statusSymbols } from './tui-utils.js';
import { zen, tiered } from '../theme.js';
const WELCOME_LINES = {
    beginner: 'Terminal-native parallel multi-agent coding platform. Try: "Add a /healthz endpoint to the API."',
    intermediate: 'Terminal-native parallel multi-agent coding platform. Type a task or /help for commands.',
    advanced: 'Type a task or /help.',
};
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
    // Hide analysis for straightforward tasks where the score adds visual noise
    // (e.g. simple conversational questions). Show when there are real conflicts,
    // unique insights, or the agent was genuinely uncertain.
    const hasConflicts = analysis.conflicts.length > 0;
    const hasInsights = analysis.uniqueInsights.length > 0;
    const isTrivial = !hasConflicts && !hasInsights && analysis.confidence >= 0.7;
    if (isTrivial)
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
/**
 * Estimate how many terminal rows a message will occupy.
 *
 * Layout per message:
 *   Line 1: "▸ You: HH:MM:SS" header
 *   Line 2+: content (word-wrapped to fitWidth)
 *   Optional: streaming cursor, tool call badges, analysis section
 *   Margin: 1 row between messages (non-system only)
 */
function estimateMessageHeight(message, fitWidth) {
    let rows = 1; // header line (role + timestamp)
    // Content area: subtract the chat box border+padding (4) and the
    // message bubble's left margin (2) from the available width.
    const contentWidth = Math.max(1, fitWidth - 6);
    const content = message.content ?? '';
    // Count explicit newlines + estimate wrapping per line.
    const lines = content.split('\n');
    for (const line of lines) {
        rows += Math.max(1, Math.ceil(line.length / contentWidth));
    }
    // Streaming cursor adds 1 row while active.
    if (message.streaming)
        rows += 1;
    // Tool call badges: 1 row each.
    if (message.toolCalls)
        rows += message.toolCalls.length;
    // Analysis section: header (1) + optional thought (1-2).
    if (message.analysis) {
        rows += 1; // analysis header
        if (message.analysis.thought)
            rows += 1;
    }
    // Margin between messages (non-system).
    if (message.role !== 'system')
        rows += 1;
    return rows;
}
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
        React.createElement(Box, { marginLeft: 2, flexDirection: "column", width: "100%", flexShrink: 1 },
            isSystem ? (React.createElement(Text, { dimColor: true }, message.content)) : (React.createElement(Markdown, { content: message.content })),
            message.streaming && React.createElement(Text, { dimColor: true }, "\u258A"),
            message.toolCalls?.map((tc, i) => (React.createElement(ToolCallBadge, { key: i, indicator: tc }))),
            message.analysis && React.createElement(AnalysisSection, { analysis: message.analysis }))));
};
export const Chat = ({ messages, focused = false, height = 20, width = 80, skillModel }) => {
    const getItemHeight = useCallback((msg) => estimateMessageHeight(msg, width), [width]);
    return (React.createElement(Box, { flexDirection: "column", height: height, overflow: "hidden" },
        messages.length === 0 && (React.createElement(Box, { flexDirection: "column", paddingX: 2, paddingY: 1 },
            React.createElement(Text, { bold: true, color: zen.accent }, "Chimera"),
            React.createElement(Text, { dimColor: true }, tiered(WELCOME_LINES, skillModel)))),
        React.createElement(Viewport, { items: messages, height: height, focused: focused, getItemHeight: getItemHeight, renderItem: (msg, _index, isSelected) => (React.createElement(MessageBubble, { message: msg, isSelected: isSelected })) })));
};
//# sourceMappingURL=chat.js.map