import { SNIP_MAX_CHARS } from './thresholds.js';

export interface SnipResult {
  messages: Array<{ role: string; content: string }>;
  tokensSaved: number;
  boundaries: number[];
}

export function snipCompact(
  messages: Array<{ role: string; content: string }>,
): SnipResult {
  let tokensSaved = 0;
  const boundaries: number[] = [];

  const result = messages.map((msg, idx) => {
    if (msg.content.length <= SNIP_MAX_CHARS) return msg;

    const original = msg.content;
    const lines = original.split('\n');
    const kept: string[] = [];
    let charCount = 0;

    for (const line of lines) {
      if (charCount + line.length + 1 > SNIP_MAX_CHARS) break;
      kept.push(line);
      charCount += line.length + 1;
    }

    if (kept.length === 0) kept.push(lines[0] ?? '');

    const trimmed = kept.join('\n');
    const saved = Math.ceil((original.length - trimmed.length) / 4);
    tokensSaved += saved;
    if (saved > 0) boundaries.push(idx);

    return { ...msg, content: trimmed + '\n... [snipped]' };
  });

  return { messages: result, tokensSaved, boundaries };
}
