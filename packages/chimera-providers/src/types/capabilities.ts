import { z } from 'zod';

/**
 * Tiered structured output support levels.
 * - 'enforced': Provider enforces via grammar/constrained decoding (e.g., Claude, Codex)
 * - 'best-effort': Provider attempts but may not guarantee (e.g., Pi, Copilot)
 * - false: Provider cannot do structured output
 */
export const StructuredOutputLevel = z.enum(['enforced', 'best-effort', 'false']);
export type StructuredOutputLevel = z.infer<typeof StructuredOutputLevel>;

/**
 * Provider capabilities — static metadata about what a provider supports.
 * Modeled after Omnigent's ProviderCapabilities pattern with tiered flags.
 */
export const ProviderCapabilitiesSchema = z.object({
  sessionResume: z.boolean().describe('Provider supports resuming sessions'),
  mcp: z.boolean().describe('Provider supports MCP tool integration'),
  hooks: z.boolean().describe('Provider supports lifecycle hooks'),
  skills: z.boolean().describe('Provider supports skill loading'),
  agents: z.boolean().describe('Provider supports inline sub-agent definitions'),
  toolRestrictions: z.boolean().describe('Provider supports per-tool allow/deny lists'),
  structuredOutput: StructuredOutputLevel.describe('Structured output capability level'),
  envInjection: z.boolean().describe('Provider supports environment variable injection'),
  costControl: z.boolean().describe('Provider supports cost tracking and limits'),
  effortControl: z.boolean().describe('Provider supports effort/thinking budget control'),
  thinkingControl: z.boolean().describe('Provider supports extended thinking toggle'),
  fallbackModel: z.boolean().describe('Provider supports automatic fallback to another model'),
  sandbox: z.boolean().describe('Provider supports sandboxed execution'),
  nativeTools: z.boolean().describe('Provider has built-in tool support'),
  streaming: z.boolean().describe('Provider supports streaming responses'),
  vision: z.boolean().describe('Provider supports image/vision inputs'),
  reasoning: z.boolean().describe('Provider supports reasoning/thinking mode'),
  functionCalling: z.boolean().describe('Provider supports function/tool calling'),
});

export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

/** Default capabilities — conservative, all false */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  sessionResume: false,
  mcp: false,
  hooks: false,
  skills: false,
  agents: false,
  toolRestrictions: false,
  structuredOutput: 'false',
  envInjection: false,
  costControl: false,
  effortControl: false,
  thinkingControl: false,
  fallbackModel: false,
  sandbox: false,
  nativeTools: false,
  streaming: true,
  vision: false,
  reasoning: false,
  functionCalling: false,
};

/** Anthropic capabilities */
export const ANTHROPIC_CAPABILITIES: ProviderCapabilities = {
  ...DEFAULT_CAPABILITIES,
  sessionResume: true,
  mcp: true,
  hooks: true,
  skills: true,
  agents: true,
  toolRestrictions: true,
  structuredOutput: 'enforced',
  costControl: true,
  effortControl: true,
  thinkingControl: true,
  fallbackModel: true,
  nativeTools: true,
  streaming: true,
  vision: true,
  reasoning: true,
  functionCalling: true,
};

/** OpenAI capabilities */
export const OPENAI_CAPABILITIES: ProviderCapabilities = {
  ...DEFAULT_CAPABILITIES,
  sessionResume: false,
  mcp: true,
  hooks: false,
  skills: false,
  agents: false,
  toolRestrictions: true,
  structuredOutput: 'enforced',
  costControl: true,
  effortControl: false,
  thinkingControl: false,
  fallbackModel: false,
  nativeTools: true,
  streaming: true,
  vision: true,
  reasoning: true,
  functionCalling: true,
};

/** OpenRouter capabilities — depends on underlying model */
export const OPENROUTER_CAPABILITIES: ProviderCapabilities = {
  ...DEFAULT_CAPABILITIES,
  sessionResume: false,
  mcp: false,
  structuredOutput: 'best-effort',
  costControl: true,
  streaming: true,
  vision: true,
  functionCalling: true,
};

/** Ollama capabilities — local, limited */
export const OLLAMA_CAPABILITIES: ProviderCapabilities = {
  ...DEFAULT_CAPABILITIES,
  sessionResume: false,
  costControl: false,
  streaming: true,
  functionCalling: false,
  structuredOutput: 'best-effort',
};

/** Google capabilities */
export const GOOGLE_CAPABILITIES: ProviderCapabilities = {
  ...DEFAULT_CAPABILITIES,
  sessionResume: false,
  structuredOutput: 'best-effort',
  costControl: true,
  streaming: true,
  vision: true,
  reasoning: true,
  functionCalling: true,
};
