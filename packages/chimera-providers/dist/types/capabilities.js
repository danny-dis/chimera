"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOOGLE_CAPABILITIES = exports.OLLAMA_CAPABILITIES = exports.OPENROUTER_CAPABILITIES = exports.OPENAI_CAPABILITIES = exports.ANTHROPIC_CAPABILITIES = exports.DEFAULT_CAPABILITIES = exports.ProviderCapabilitiesSchema = exports.StructuredOutputLevel = void 0;
const zod_1 = require("zod");
/**
 * Tiered structured output support levels.
 * - 'enforced': Provider enforces via grammar/constrained decoding (e.g., Claude, Codex)
 * - 'best-effort': Provider attempts but may not guarantee (e.g., Pi, Copilot)
 * - false: Provider cannot do structured output
 */
exports.StructuredOutputLevel = zod_1.z.enum(['enforced', 'best-effort', 'false']);
/**
 * Provider capabilities — static metadata about what a provider supports.
 * Modeled after Omnigent's ProviderCapabilities pattern with tiered flags.
 */
exports.ProviderCapabilitiesSchema = zod_1.z.object({
    sessionResume: zod_1.z.boolean().describe('Provider supports resuming sessions'),
    mcp: zod_1.z.boolean().describe('Provider supports MCP tool integration'),
    hooks: zod_1.z.boolean().describe('Provider supports lifecycle hooks'),
    skills: zod_1.z.boolean().describe('Provider supports skill loading'),
    agents: zod_1.z.boolean().describe('Provider supports inline sub-agent definitions'),
    toolRestrictions: zod_1.z.boolean().describe('Provider supports per-tool allow/deny lists'),
    structuredOutput: exports.StructuredOutputLevel.describe('Structured output capability level'),
    envInjection: zod_1.z.boolean().describe('Provider supports environment variable injection'),
    costControl: zod_1.z.boolean().describe('Provider supports cost tracking and limits'),
    effortControl: zod_1.z.boolean().describe('Provider supports effort/thinking budget control'),
    thinkingControl: zod_1.z.boolean().describe('Provider supports extended thinking toggle'),
    fallbackModel: zod_1.z.boolean().describe('Provider supports automatic fallback to another model'),
    sandbox: zod_1.z.boolean().describe('Provider supports sandboxed execution'),
    nativeTools: zod_1.z.boolean().describe('Provider has built-in tool support'),
    streaming: zod_1.z.boolean().describe('Provider supports streaming responses'),
    vision: zod_1.z.boolean().describe('Provider supports image/vision inputs'),
    reasoning: zod_1.z.boolean().describe('Provider supports reasoning/thinking mode'),
    functionCalling: zod_1.z.boolean().describe('Provider supports function/tool calling'),
});
/** Default capabilities — conservative, all false */
exports.DEFAULT_CAPABILITIES = {
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
exports.ANTHROPIC_CAPABILITIES = {
    ...exports.DEFAULT_CAPABILITIES,
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
exports.OPENAI_CAPABILITIES = {
    ...exports.DEFAULT_CAPABILITIES,
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
exports.OPENROUTER_CAPABILITIES = {
    ...exports.DEFAULT_CAPABILITIES,
    sessionResume: false,
    mcp: false,
    structuredOutput: 'best-effort',
    costControl: true,
    streaming: true,
    vision: true,
    functionCalling: true,
};
/** Ollama capabilities — local, limited */
exports.OLLAMA_CAPABILITIES = {
    ...exports.DEFAULT_CAPABILITIES,
    sessionResume: false,
    costControl: false,
    streaming: true,
    functionCalling: false,
    structuredOutput: 'best-effort',
};
/** Google capabilities */
exports.GOOGLE_CAPABILITIES = {
    ...exports.DEFAULT_CAPABILITIES,
    sessionResume: false,
    structuredOutput: 'best-effort',
    costControl: true,
    streaming: true,
    vision: true,
    reasoning: true,
    functionCalling: true,
};
//# sourceMappingURL=capabilities.js.map