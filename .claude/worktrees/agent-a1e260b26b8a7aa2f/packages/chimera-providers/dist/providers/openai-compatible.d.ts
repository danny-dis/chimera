import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
export interface OpenAICompatibleOptions {
    pricing?: PricingInfo;
    modelInfo?: Partial<ModelInfo>;
    headers?: Record<string, string>;
    timeoutMs?: number;
}
export interface OpenAICompatibleConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    options?: OpenAICompatibleOptions;
}
export declare class OpenAICompatibleProvider implements ModelProvider {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly model;
    private readonly pricing;
    private readonly modelInfo;
    private readonly headers;
    private readonly timeoutMs;
    constructor(config: OpenAICompatibleConfig);
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
    supportsToolCalling(): boolean;
    supportsStructuredOutput(): boolean;
    supportsVision(): boolean;
    supportsReasoning(): boolean;
    countTokens(text: string): number;
    countTokensForMessages(messages: Message[]): number;
    private fetchJson;
    private fetchStream;
}
//# sourceMappingURL=openai-compatible.d.ts.map