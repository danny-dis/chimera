import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
import { ProviderCapabilities } from '../types/capabilities.js';
export interface OpenRouterOptions {
    pricing?: PricingInfo;
    modelInfo?: Partial<ModelInfo>;
    timeoutMs?: number;
    /** HTTP-Referer header for OpenRouter ranking */
    httpReferer?: string;
    /** X-Title header for OpenRouter ranking */
    title?: string;
}
export interface OpenRouterConfig {
    apiKey: string;
    model: string;
    options?: OpenRouterOptions;
}
/**
 * OpenRouter provider — routes requests to 200+ models via a single API key.
 * Supports Claude, GPT, Gemini, Llama, Mistral, and more.
 *
 * @see https://openrouter.ai/docs
 */
export declare class OpenRouterProvider implements ModelProvider {
    private readonly apiKey;
    private readonly model;
    private readonly pricing;
    private readonly modelInfo;
    private readonly timeoutMs;
    private readonly headers;
    constructor(config: OpenRouterConfig);
    complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult>;
    stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk>;
    getModel(): ModelInfo;
    getContextWindow(): number;
    getMaxOutputTokens(): number;
    getCost(tokens: {
        input: number;
        output: number;
    }): number;
    getPricing(): PricingInfo;
    getCapabilities(): ProviderCapabilities;
    supportsToolCalling(): boolean;
    supportsStructuredOutput(): boolean;
    supportsVision(): boolean;
    supportsReasoning(): boolean;
    countTokens(text: string): number;
    countTokensForMessages(messages: Message[]): number;
    private fetchJson;
}
//# sourceMappingURL=openrouter.d.ts.map