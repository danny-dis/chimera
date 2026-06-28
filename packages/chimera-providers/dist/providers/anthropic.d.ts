import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
import { ProviderCapabilities } from '../types/capabilities.js';
export interface AnthropicOptions {
    pricing?: PricingInfo;
    modelInfo?: Partial<ModelInfo>;
    apiVersion?: string;
    timeoutMs?: number;
}
export interface AnthropicConfig {
    apiKey: string;
    model: string;
    options?: AnthropicOptions;
}
export declare class AnthropicProvider implements ModelProvider {
    private readonly apiKey;
    private readonly model;
    private readonly pricing;
    private readonly modelInfo;
    private readonly apiVersion;
    private readonly timeoutMs;
    constructor(config: AnthropicConfig);
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
    private getHeaders;
    private fetch;
}
//# sourceMappingURL=anthropic.d.ts.map