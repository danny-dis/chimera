import React from 'react';
import { Box, Text } from 'ink';
import type { Message, ToolCallIndicator } from '../types.js';
import { Viewport } from './viewport.js';
import { Markdown } from './markdown.js';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';

interface ChatProps {
  messages: Message[];
  focused?: boolean;
  height?: number;
}

const ToolCallBadge: React.FC<{ indicator: ToolCallIndicator }> = ({ indicator }) => {
  const st = statusSymbols[indicator.status];
  const statusSymbol = st.symbol;
  const statusColor = st.color;

  return (
    <Box marginLeft={2} marginTop={0}>
      <Text color={statusColor}>
        {statusSymbol} {indicator.name}
      </Text>
      {indicator.args && <Text dimColor> {indicator.args.slice(0, 60)}</Text>}
      {indicator.status === 'error' && indicator.result && (
        <Text color={zen.error}> {indicator.result.slice(0, 60)}</Text>
      )}
    </Box>
  );
};

const AnalysisSection: React.FC<{ analysis: Message['analysis'] }> = ({ analysis }) => {
  if (!analysis) return null;

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={zen.muted} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={zen.warning}>Deliberation Analysis</Text>
        <Text color={analysis.confidence > 0.7 ? zen.success : zen.warning}>
          Confidence: {(analysis.confidence * 100).toFixed(0)}%
        </Text>
      </Box>

      {analysis.thought && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor italic>Judge's Thought:</Text>
          <Text dimColor>{analysis.thought.slice(0, 300)}{analysis.thought.length > 300 ? '...' : ''}</Text>
        </Box>
      )}

      {analysis.consensus.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color={zen.success}>Consensus:</Text>
          {analysis.consensus.map((c, i) => (
            <Text key={i}>• {c}</Text>
          ))}
        </Box>
      )}

      {analysis.conflicts.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color={zen.error}>Conflicts:</Text>
          {analysis.conflicts.map((c, i) => (
            <Text key={i}>• {c}</Text>
          ))}
        </Box>
      )}

      {analysis.uniqueInsights.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color={zen.info}>Unique Insights:</Text>
          {analysis.uniqueInsights.map((ins, i) => (
            <Text key={i}>• {ins}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

const MessageBubble: React.FC<{ message: Message; isSelected: boolean }> = ({ message, isSelected }) => {
  const prefix =
    message.role === 'user' ? 'You' :
    message.role === 'system' ? 'System' :
    'Assistant';

  const color =
    message.role === 'user' ? zen.accent :
    message.role === 'system' ? zen.muted :
    zen.success;

  const isSystem = message.role === 'system';

  return (
    <Box flexDirection="column" marginBottom={isSystem ? 0 : 1}>
      <Box>
        <Text inverse={isSelected}>{isSelected ? '▸' : ' '}</Text>
        <Text bold color={color}>
          {' '}{prefix}:
        </Text>
        <Text dimColor> {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {/* Render assistant/user messages through the markdown renderer.
            System messages are plain text (command output). */}
        {isSystem ? (
          <Text dimColor>{message.content}</Text>
        ) : (
          <Markdown content={message.content} />
        )}
        {message.streaming && <Text dimColor>▊</Text>}
        {message.toolCalls?.map((tc, i) => (
          <ToolCallBadge key={i} indicator={tc} />
        ))}
        {message.analysis && isSelected && <AnalysisSection analysis={message.analysis} />}
      </Box>
    </Box>
  );
};

export const Chat: React.FC<ChatProps> = ({ messages, focused = false, height = 20 }) => {
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {messages.length === 0 && (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text bold color={zen.accent}>Chimera</Text>
          <Text dimColor>Terminal-native parallel multi-agent coding platform.</Text>
          <Text dimColor>Type a task or /help for commands.</Text>
        </Box>
      )}
      <Viewport
        items={messages}
        height={height}
        focused={focused}
        renderItem={(msg, _index, isSelected) => (
          <MessageBubble message={msg} isSelected={isSelected} />
        )}
      />
    </Box>
  );
};
