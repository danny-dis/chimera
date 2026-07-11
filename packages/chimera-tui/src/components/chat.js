import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { Viewport } from './viewport.js';
import { Markdown } from './markdown.js';
import { statusSymbols } from './tui-utils.js';
import { zen } from '../theme.js';
const ToolCallBadge = ({ indicator }) => {
    const st = statusSymbols[indicator.status];
    const statusSymbol = st.symbol;
    const statusColor = st.color;
    return (<Box marginLeft={2} marginTop={0}>
      <Text color={statusColor}>
        {statusSymbol} {indicator.name}
      </Text>
      {indicator.args && <Text dimColor> {indicator.args.slice(0, 60)}</Text>}
      {indicator.status === 'error' && indicator.result && (<Text color={zen.error}> {indicator.result.slice(0, 60)}</Text>)}
    </Box>);
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
    return (<Box marginTop={1} flexDirection="column">
      <Box>
        <Text bold color={zen.warning}>📊 Analysis</Text>
        <Text> </Text>
        <Text color={analysis.confidence > 0.7 ? zen.success : zen.warning}>
          {(analysis.confidence * 100).toFixed(0)}%
        </Text>
        {summaryParts.length > 0 && (<Text dimColor> — {summaryParts.join(', ')}</Text>)}
      </Box>
      {analysis.thought && (<Text dimColor italic>  {analysis.thought.slice(0, 120)}{analysis.thought.length > 120 ? '…' : ''}</Text>)}
    </Box>);
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
    return (<Box flexDirection="column" marginBottom={isSystem ? 0 : 1}>
      <Box>
        <Text inverse={isSelected}>{isSelected ? '▸' : ' '}</Text>
        <Text bold color={color}>
          {' '}{prefix}:
        </Text>
        <Text dimColor> {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column" width="100%" flexShrink={1}>
        {isSystem ? (<Text dimColor>{message.content}</Text>) : (<Markdown content={message.content}/>)}
        {message.streaming && <Text dimColor>▊</Text>}
        {message.toolCalls?.map((tc, i) => (<ToolCallBadge key={i} indicator={tc}/>))}
        {message.analysis && <AnalysisSection analysis={message.analysis}/>}
      </Box>
    </Box>);
};
export const Chat = ({ messages, focused = false, height = 20, width = 80 }) => {
    const getItemHeight = useCallback((msg) => estimateMessageHeight(msg, width), [width]);
    return (<Box flexDirection="column" height={height} overflow="hidden">
      {messages.length === 0 && (<Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text bold color={zen.accent}>Chimera</Text>
          <Text dimColor>Terminal-native parallel multi-agent coding platform.</Text>
          <Text dimColor>Type a task or /help for commands.</Text>
        </Box>)}
      <Viewport items={messages} height={height} focused={focused} getItemHeight={getItemHeight} renderItem={(msg, _index, isSelected) => (<MessageBubble message={msg} isSelected={isSelected}/>)}/>
    </Box>);
};
//# sourceMappingURL=chat.js.map