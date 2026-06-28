import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
import { ProviderCapabilities } from '../types/capabilities.js';
export interface OllamaOptions {
    modelInfo?: Partial<ModelInfo>;
    timeoutMs?: number;
}
export interface OllamaConfig {
    baseUrl?: string;
    model: string;
    options?: OllamaOptions;
}
export declare class OllamaProvider implements ModelProvider {
    private readonly baseUrl;
    private readonly model;
    private readonly modelInfo;
    private readonly timeoutMs;
    constructor(config: OllamaConfig);
    complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult>;
    stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk>;
    getModel(): ModelInfo;
    getContextWindow(): number;
    getMaxOutputTokens(): number;
    getCost(_tokens: {
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
//# sourceMappingURL=ollama.d.ts.map