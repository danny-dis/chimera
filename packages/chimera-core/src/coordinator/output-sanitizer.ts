/**
 * Extract the clean response from writer output, discarding all
 * reasoning, analysis scaffolding, and JSON schema echoes.
 *
 * Returns the response text, or empty string if extraction fails.
 * Empty string signals the caller to degrade rather than display garbage.
 */
export function sanitizeWriterOutput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';

  // 1. Try structured JSON extraction first (most reliable path)
  const jsonBlock = extractLargestJson(trimmed);
  if (jsonBlock) {
    try {
      const obj = JSON.parse(jsonBlock);
      if (typeof obj.response === 'string' && obj.response.trim().length > 0) {
        return obj.response.trim();
      }
    } catch { /* not valid JSON, continue */ }
  }

  // 2. Direct regex extraction of "response" field value
  const directMatch = trimmed.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (directMatch?.[1]) {
    const val = directMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    if (val.length > 0) return val;
  }

  // 3. Try multiline "response" extraction (model may split across lines)
  const multiMatch = trimmed.match(/"response"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (multiMatch?.[1]) {
    const val = multiMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    if (val.length > 0) return val;
  }

  // 4. Model dumped reasoning scaffolding — strip it and look for answer content.
  if (hasReasoningScaffolding(trimmed)) {
    const stripped = stripScaffolding(trimmed);
    if (stripped.length > 0) return stripped;
  }

  // 5. No JSON, no scaffolding — plain text passthrough.
  if (!jsonBlock && !trimmed.includes('"response"') && !hasReasoningScaffolding(trimmed)) {
    return trimmed;
  }

  // 6. Nothing extractable — return empty to trigger degraded path
  return '';
}

const SCAFFOLD_PATTERNS = [
  /<thought>/i,
  /"thought"\s*:/,
  /Alternative Paths?:/i,
  /Chosen Path:/i,
  /Risk Register:/i,
  /^\s*Risk:\s/im,
  /STRATEGIC PLAN/i,
  /Context Analysis:/i,
  /Adversarial Critique:/i,
  /Ground Truth/i,
  /AS YOU WISH/i,
  /\bPL\d+\b/,
  /^\s*"[a-z]+"\s*:\s*(?:string|number|boolean|\d|\[|{)/m,
  /^\s*\d+\.\s+Platonism/im,
  /^\s*\d+\.\s+Phenomenology/im,
  /^\s*\w+\s+Chosen Path:/im,
  /^\s*Path [A-Z]:/im,
  /"response"\s*:\s*(?:string|number|boolean)/i,
  /"rationale"\s*:/,
  /"filesChanged"\s*:/,
  /"issues"\s*:/,
  /"confidence"\s*:\s*number/i,
  /JSON schema/i,
  /schema:/i,
];

function hasReasoningScaffolding(text: string): boolean {
  return SCAFFOLD_PATTERNS.some((p) => p.test(text));
}

function stripScaffolding(text: string): string {
  const lines = text.split('\n');
  const answerLines: string[] = [];
  let inScaffold = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (answerLines.length === 0 && trimmed === '') continue;

    if (SCAFFOLD_PATTERNS.some((p) => p.test(line))) {
      inScaffold = true;
      continue;
    }

    if (/^\s*"[a-z]+"\s*:\s*(?:string|number|boolean|\d|\[|{)/i.test(line)) {
      inScaffold = true;
      continue;
    }

    if (inScaffold) {
      inScaffold = false;
    }

    answerLines.push(line);
  }

  const result = answerLines.join('\n').trim();

  const responseMatch = result.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (responseMatch?.[1]) {
    const extracted = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    if (extracted.length > 0) return extracted;
  }

  const multiResponse = result.match(/"response"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (multiResponse?.[1]) {
    const extracted = multiResponse[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    if (extracted.length > 0) return extracted;
  }

  if (result.length < text.length * 0.2 && result.length < 50) return '';
  return result;
}

function extractLargestJson(text: string): string | null {
  let best = '';
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        if (candidate.length > best.length) best = candidate;
        start = -1;
      }
    }
  }

  return best.length > 2 ? best : null;
}
