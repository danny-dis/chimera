import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
import { ProviderCapabilities } from '../types/capabilities.js';
export interface GoogleOptions {
    pricing?: PricingInfo;
    modelInfo?: Partial<ModelInfo>;
    apiVersion?: string;
    timeoutMs?: number;
}
export interface GoogleConfig {
    apiKey: string;
    model: string;
    options?: GoogleOptions;
    projectId?: string;
}
export declare class GoogleProvider implements ModelProvider {
    private readonly apiKey;
    private readonly model;
    private readonly pricing;
    private readonly modelInfo;
    private readonly timeoutMs;
    constructor(config: GoogleConfig);
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
//# sourceMappingURL=google.d.ts.map