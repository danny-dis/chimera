export interface CollapseResult {
  messages: Array<{ role: string; content: string }>;
  tokensSaved: number;
}

export function contextCollapse(
  messages: Array<{ role: string; content: string }>,
): CollapseResult {
  let tokensSaved = 0;

  const collapsed: Array<{ role: string; content: string }> = [];
  let consecutiveToolCount = 0;
  let toolBuffer: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      consecutiveToolCount++;
      toolBuffer.push(msg);
    } else {
      if (consecutiveToolCount > 3) {
        const first = toolBuffer[0];
        const last = toolBuffer[toolBuffer.length - 1];
        if (first && last) {
          const collapsedContent = [
            `[${consecutiveToolCount} tool results collapsed]`,
            `First: ${first.content.slice(0, 200)}`,
            `Last: ${last.content.slice(0, 200)}`,
          ].join('\n');
          const originalTokens = Math.ceil(
            toolBuffer.reduce((sum, t) => sum + t.content.length, 0) / 4,
          );
          const newTokens = Math.ceil(collapsedContent.length / 4);
          tokensSaved += Math.max(0, originalTokens - newTokens);
          collapsed.push({ role: 'tool', content: collapsedContent });
        }
      } else {
        collapsed.push(...toolBuffer);
      }
      consecutiveToolCount = 0;
      toolBuffer = [];
      collapsed.push(msg);
    }
  }

  if (consecutiveToolCount > 3 && toolBuffer.length > 0) {
    const first = toolBuffer[0];
    const last = toolBuffer[toolBuffer.length - 1];
    if (first && last) {
      const collapsedContent = [
        `[${consecutiveToolCount} tool results collapsed]`,
        `First: ${first.content.slice(0, 200)}`,
        `Last: ${last.content.slice(0, 200)}`,
      ].join('\n');
      const originalTokens = Math.ceil(
        toolBuffer.reduce((sum, t) => sum + t.content.length, 0) / 4,
      );
      const newTokens = Math.ceil(collapsedContent.length / 4);
      tokensSaved += Math.max(0, originalTokens - newTokens);
      collapsed.push({ role: 'tool', content: collapsedContent });
    }
  } else {
    collapsed.push(...toolBuffer);
  }

  return { messages: collapsed, tokensSaved };
}
