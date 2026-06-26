import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
const ToolCallBadge = ({ indicator }) => {
    const statusSymbol = {
        pending: '○',
        running: '◉',
        completed: '✓',
        error: '✗',
    }[indicator.status];
    const statusColor = {
        pending: 'gray',
        running: 'yellow',
        completed: 'green',
        error: 'red',
    }[indicator.status];
    return (React.createElement(Box, { marginLeft: 2 },
        React.createElement(Text, { color: statusColor },
            statusSymbol,
            " ",
            indicator.name),
        indicator.args && React.createElement(Text, { dimColor: true },
            " ",
            indicator.args.slice(0, 50)),
        indicator.status === 'error' && indicator.result && (React.createElement(Text, { color: "red" },
            " ",
            indicator.result.slice(0, 50)))));
};
const MessageBubble = ({ message }) => {
    const isUser = message.role === 'user';
    const prefix = isUser ? 'You' : 'Assistant';
    const color = isUser ? 'cyan' : 'green';
    return (React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
        React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: color },
                prefix,
                ":")),
        React.createElement(Box, { marginLeft: 2, flexDirection: "column" },
            React.createElement(Text, null, message.content),
            message.streaming && React.createElement(Text, { dimColor: true }, "\u258A"),
            message.toolCalls?.map((tc, i) => (React.createElement(ToolCallBadge, { key: i, indicator: tc }))))));
};
export const Chat = ({ messages, maxHeight = 30 }) => {
    const containerRef = useRef(null);
    useEffect(() => {
        const el = containerRef.current;
        if (el) {
            el.scrollTop = Infinity;
        }
    }, [messages]);
    const visibleMessages = messages.slice(-maxHeight);
    return (React.createElement(Box, { ref: containerRef, flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        visibleMessages.map((msg) => (React.createElement(MessageBubble, { key: msg.id, message: msg }))),
        messages.length === 0 && (React.createElement(Text, { dimColor: true }, "No messages yet. Start a conversation!"))));
};
//# sourceMappingURL=chat.js.map