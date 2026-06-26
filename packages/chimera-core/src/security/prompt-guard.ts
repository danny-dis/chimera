/**
 * Prompt injection defense — detects and blocks injection attempts
 * in user input and tool outputs before they reach the LLM.
 */

export interface InjectionCheck {
  safe: boolean;
  confidence: number; // 0-1, higher = more confident it's an attack
  flags: InjectionFlag[];
  sanitized?: string;
}

export type InjectionFlag =
  | 'instruction_override'
  | 'role_hijack'
  | 'delimiter_injection'
  | 'data_exfil'
  | 'encoded_payload'
  | 'system_prompt_leak';

interface DetectionRule {
  flag: InjectionFlag;
  pattern: RegExp;
  confidence: number;
  description: string;
}

const USER_INPUT_RULES: DetectionRule[] = [
  // Instruction override attempts
  {
    flag: 'instruction_override',
    pattern: /(?:ignore|disregard|forget|override)\s+(?:previous|above|all|your)\s+(?:instructions|rules|guidelines|prompts)/i,
    confidence: 0.95,
    description: 'Attempt to override system instructions',
  },
  {
    flag: 'instruction_override',
    pattern: /(?:you\s+are\s+now|from\s+now\s+on|new\s+instructions|system\s*:\s*)/i,
    confidence: 0.8,
    description: 'Attempt to redefine agent identity',
  },
  {
    flag: 'instruction_override',
    pattern: /(?:act\s+as|pretend\s+(?:to\s+be|you(?:'re|\s+are))|roleplay\s+as)/i,
    confidence: 0.7,
    description: 'Attempt to change agent role',
  },

  // Role hijacking
  {
    flag: 'role_hijack',
    pattern: /(?:^|\n)\s*(?:system|assistant)\s*:/im,
    confidence: 0.9,
    description: 'Attempt to inject message role markers',
  },
  {
    flag: 'role_hijack',
    pattern: /<\|?(?:system|assistant|endoftext|im_start|im_end)\|?>/i,
    confidence: 0.95,
    description: 'Attempt to inject special tokens',
  },

  // Delimiter injection
  {
    flag: 'delimiter_injection',
    pattern: /(?:<<<<<<< SEARCH|>>>>>>> REPLACE|=======)/,
    confidence: 0.6,
    description: 'Search-replace block delimiters in user input',
  },
  {
    flag: 'delimiter_injection',
    pattern: /```(?:system|admin|root|shell|bash)\b/i,
    confidence: 0.7,
    description: 'Attempting to create privileged code blocks',
  },

  // Data exfiltration patterns
  {
    flag: 'data_exfil',
    pattern: /(?:send|post|upload|transmit|exfiltrate)\s+(?:this|all|the|my)\s+(?:data|info|content|output|response)\s+to\s+(?:https?:\/\/|ftp:\/\/)/i,
    confidence: 0.9,
    description: 'Attempt to exfiltrate data to external URL',
  },
  {
    flag: 'data_exfil',
    pattern: /(?:curl|wget|fetch|axios|requests?)\s+(?:.*?)(?:https?:\/\/)/i,
    confidence: 0.7,
    description: 'HTTP request to external URL in user input',
  },

  // System prompt leak attempts
  {
    flag: 'system_prompt_leak',
    pattern: /(?:show|reveal|print|output|repeat|echo)\s+(?:your|the)\s+(?:system\s+prompt|instructions|rules|initial\s+prompt)/i,
    confidence: 0.85,
    description: 'Attempt to extract system prompt',
  },
  {
    flag: 'system_prompt_leak',
    pattern: /(?:what\s+(?:are|is)\s+your|tell\s+me\s+your)\s+(?:system\s+prompt|instructions|rules)/i,
    confidence: 0.8,
    description: 'Attempt to query system prompt',
  },
];

const TOOL_OUTPUT_RULES: DetectionRule[] = [
  // Injection via tool output
  {
    flag: 'instruction_override',
    pattern: /(?:ignore|disregard)\s+(?:previous|above)\s+(?:instructions|prompts)/i,
    confidence: 0.9,
    description: 'Instruction override in tool output',
  },
  {
    flag: 'role_hijack',
    pattern: /(?:^|\n)\s*(?:system|assistant)\s*:/im,
    confidence: 0.85,
    description: 'Role marker injection in tool output',
  },
  {
    flag: 'delimiter_injection',
    pattern: /<script[\s>]/i,
    confidence: 0.8,
    description: 'Script tag in tool output',
  },
  {
    flag: 'encoded_payload',
    pattern: /(?:base64|atob|btoa|Buffer\.from)\s*\(/i,
    confidence: 0.5,
    description: 'Encoded content in tool output',
  },
];

function checkAgainstRules(input: string, rules: DetectionRule[]): InjectionCheck {
  const flags: InjectionFlag[] = [];
  let maxConfidence = 0;

  for (const rule of rules) {
    if (rule.pattern.test(input)) {
      flags.push(rule.flag);
      maxConfidence = Math.max(maxConfidence, rule.confidence);
    }
  }

  // Multiple flags increase confidence
  if (flags.length >= 3) {
    maxConfidence = Math.min(1, maxConfidence + 0.1);
  }

  return {
    safe: flags.length === 0,
    confidence: maxConfidence,
    flags,
  };
}

/**
 * Check user input for prompt injection attempts.
 */
export function checkUserInput(input: string): InjectionCheck {
  if (!input || input.trim().length === 0) {
    return { safe: true, confidence: 0, flags: [] };
  }

  // Truncate very long inputs for performance
  const truncated = input.length > 10000 ? input.slice(0, 10000) : input;
  return checkAgainstRules(truncated, USER_INPUT_RULES);
}

/**
 * Check tool output for injection attempts.
 * Some tools (web fetch, shell output) are higher risk.
 */
export function checkToolOutput(output: string, toolName?: string): InjectionCheck {
  if (!output || output.trim().length === 0) {
    return { safe: true, confidence: 0, flags: [] };
  }

  // Higher scrutiny for web/shell tools
  const highRiskTools = ['webfetch', 'websearch', 'run_shell_command'];
  const isHighRisk = toolName && highRiskTools.includes(toolName);

  const truncated = output.length > 20000 ? output.slice(0, 20000) : output;
  const result = checkAgainstRules(truncated, TOOL_OUTPUT_RULES);

  // Lower threshold for high-risk tools
  if (isHighRisk && result.flags.length > 0) {
    result.confidence = Math.min(1, result.confidence + 0.15);
  }

  return result;
}

/**
 * PromptGuard class — wraps injection detection functions for DI.
 */
export class PromptGuard {
  checkUserInput(input: string): InjectionCheck {
    return checkUserInput(input);
  }

  checkToolOutput(output: string, toolName?: string): InjectionCheck {
    return checkToolOutput(output, toolName);
  }

  sanitizeForPrompt(text: string): string {
    return sanitizeForPrompt(text);
  }
}

/**
 * Sanitize text by removing potential injection patterns.
 * Returns cleaned text safe for inclusion in prompts.
 */
export function sanitizeForPrompt(text: string): string {
  let sanitized = text;

  // Remove role markers
  sanitized = sanitized.replace(/(?:^|\n)\s*(?:system|assistant)\s*:/gm, '\n[REDACTED]:');

  // Remove special tokens
  sanitized = sanitized.replace(/<\|?(?:system|assistant|endoftext|im_start|im_end)\|?>/gi, '[REDACTED]');

  // Remove script tags
  sanitized = sanitized.replace(/<\/?script[^>]*>/gi, '[REDACTED]');

  return sanitized;
}
