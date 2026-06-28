import { z } from 'zod';
/**
 * Tiered structured output support levels.
 * - 'enforced': Provider enforces via grammar/constrained decoding (e.g., Claude, Codex)
 * - 'best-effort': Provider attempts but may not guarantee (e.g., Pi, Copilot)
 * - false: Provider cannot do structured output
 */
export declare const StructuredOutputLevel: z.ZodEnum<["enforced", "best-effort", "false"]>;
export type StructuredOutputLevel = z.infer<typeof StructuredOutputLevel>;
/**
 * Provider capabilities — static metadata about what a provider supports.
 * Modeled after Omnigent's ProviderCapabilities pattern with tiered flags.
 */
export declare const ProviderCapabilitiesSchema: z.ZodObject<{
    sessionResume: z.ZodBoolean;
    mcp: z.ZodBoolean;
    hooks: z.ZodBoolean;
    skills: z.ZodBoolean;
    agents: z.ZodBoolean;
    toolRestrictions: z.ZodBoolean;
    structuredOutput: z.ZodEnum<["enforced", "best-effort", "false"]>;
    envInjection: z.ZodBoolean;
    costControl: z.ZodBoolean;
    effortControl: z.ZodBoolean;
    thinkingControl: z.ZodBoolean;
    fallbackModel: z.ZodBoolean;
    sandbox: z.ZodBoolean;
    nativeTools: z.ZodBoolean;
    streaming: z.ZodBoolean;
    vision: z.ZodBoolean;
    reasoning: z.ZodBoolean;
    functionCalling: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    structuredOutput: "enforced" | "best-effort" | "false";
    vision: boolean;
    reasoning: boolean;
    sessionResume: boolean;
    mcp: boolean;
    hooks: boolean;
    skills: boolean;
    agents: boolean;
    toolRestrictions: boolean;
    envInjection: boolean;
    costControl: boolean;
    effortControl: boolean;
    thinkingControl: boolean;
    fallbackModel: boolean;
    sandbox: boolean;
    nativeTools: boolean;
    streaming: boolean;
    functionCalling: boolean;
}, {
    structuredOutput: "enforced" | "best-effort" | "false";
    vision: boolean;
    reasoning: boolean;
    sessionResume: boolean;
    mcp: boolean;
    hooks: boolean;
    skills: boolean;
    agents: boolean;
    toolRestrictions: boolean;
    envInjection: boolean;
    costControl: boolean;
    effortControl: boolean;
    thinkingControl: boolean;
    fallbackModel: boolean;
    sandbox: boolean;
    nativeTools: boolean;
    streaming: boolean;
    functionCalling: boolean;
}>;
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;
/** Default capabilities — conservative, all false */
export declare const DEFAULT_CAPABILITIES: ProviderCapabilities;
/** Anthropic capabilities */
export declare const ANTHROPIC_CAPABILITIES: ProviderCapabilities;
/** OpenAI capabilities */
export declare const OPENAI_CAPABILITIES: ProviderCapabilities;
/** OpenRouter capabilities — depends on underlying model */
export declare const OPENROUTER_CAPABILITIES: ProviderCapabilities;
/** Ollama capabilities — local, limited */
export declare const OLLAMA_CAPABILITIES: ProviderCapabilities;
/** Google capabilities */
export declare const GOOGLE_CAPABILITIES: ProviderCapabilities;
//# sourceMappingURL=capabilities.d.ts.map