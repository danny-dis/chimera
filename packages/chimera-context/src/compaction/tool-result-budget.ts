import { TOOL_RESULT_MAX_BYTES, TOOL_RESULT_MAX_LINES } from './thresholds.js';

export interface ToolResultBudgetResult {
  messages: Array<{ role: string; content: string }>;
  trimmed: number;
}

export function applyToolResultBudget(
  messages: Array<{ role: string; content: string }>,
): ToolResultBudgetResult {
  let trimmed = 0;

  const result = messages.map((msg) => {
    if (msg.role !== 'tool') return msg;

    const byteSize = Buffer.byteLength(msg.content, 'utf-8');
    const lineCount = msg.content.split('\n').length;

    if (byteSize > TOOL_RESULT_MAX_BYTES || lineCount > TOOL_RESULT_MAX_LINES) {
      const lines = msg.content.split('\n');
      const keptLines = lines.slice(0, TOOL_RESULT_MAX_LINES);
      const keptBytes = Buffer.byteLength(keptLines.join('\n'), 'utf-8');

      if (keptBytes > TOOL_RESULT_MAX_BYTES) {
        let byteCount = 0;
        let cutLine = 0;
        for (let i = 0; i < keptLines.length; i++) {
          byteCount += Buffer.byteLength(keptLines[i], 'utf-8') + 1;
          if (byteCount > TOOL_RESULT_MAX_BYTES) break;
          cutLine = i;
        }
        keptLines.length = cutLine + 1;
      }

      trimmed++;
      return {
        ...msg,
        content: keptLines.join('\n') + '\n... [truncated by budget]',
      };
    }

    return msg;
  });

  return { messages: result, trimmed };
}
