import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import type { Message, ToolCallIndicator } from '../types.js';

interface ChatProps {
  messages: Message[];
  maxHeight?: number;
}

const ToolCallBadge: React.FC<{ indicator: ToolCallIndicator }> = ({ indicator }) => {
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

  return (
    <Box marginLeft={2}>
      <Text color={statusColor}>
        {statusSymbol} {indicator.name}
      </Text>
      {indicator.args && <Text dimColor> {indicator.args.slice(0, 50)}</Text>}
      {indicator.status === 'error' && indicator.result && (
        <Text color="red"> {indicator.result.slice(0, 50)}</Text>
      )}
    </Box>
  );
};

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';
  const prefix = isUser ? 'You' : 'Assistant';
  const color = isUser ? 'cyan' : 'green';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={color}>
          {prefix}:
        </Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>{message.content}</Text>
        {message.streaming && <Text dimColor>▊</Text>}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallBadge key={i} indicator={tc} />
        ))}
      </Box>
    </Box>
  );
};

export const Chat: React.FC<ChatProps> = ({ messages, maxHeight = 30 }) => {
  const containerRef = useRef<unknown>(null);

  useEffect(() => {
    const el = containerRef.current as { scrollTop?: number } | null;
    if (el) {
      el.scrollTop = Infinity;
    }
  }, [messages]);

  const visibleMessages = messages.slice(-maxHeight);

  return (
    <Box ref={containerRef as any} flexDirection="column" flexGrow={1} overflow="hidden">
      {visibleMessages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {messages.length === 0 && (
        <Text dimColor>No messages yet. Start a conversation!</Text>
      )}
    </Box>
  );
};
