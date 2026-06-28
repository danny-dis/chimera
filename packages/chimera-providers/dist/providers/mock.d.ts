import { Message, ToolCall, CompletionOptions, CompletionResult, StreamChunk, ModelInfo, PricingInfo, ModelProvider } from '../types/provider.js';
import { ProviderCapabilities } from '../types/capabilities.js';
export interface MockProviderOptions {
    /** Model id to advertise. Default: 'mock-default'. */
    model?: string;
    /** Display name. Default: 'Mock Provider'. */
    name?: string;
    /** Provider slug. Default: 'mock'. */
    provider?: string;
    /** Context window size. Default: 200_000. */
    contextWindow?: number;
    /** Max output tokens. Default: 8_192. */
    maxOutputTokens?: number;
    /** Pricing in USD per million tokens. Default: 0 (free). */
    pricing?: PricingInfo;
    /** Static response content. Default: a friendly echo. */
    response?: string | ((messages: Message[]) => string);
    /** Static tool calls (returned alongside the response). */
    toolCalls?: ToolCall[];
    /** Latency simulation in ms. Default: 0 (instant). */
    latencyMs?: number;
    /** Optional failure injection. */
    failOnCall?: number;
    /** Emit a stream of chunks instead of a single response. Default: true. */
    streamChunks?: boolean;
}
/**
 * A deterministic, offline ModelProvider used as a default when no real
 * API keys are configured. Useful for:
 *
 *   - CI smoke tests
 *   - Local "try it" runs
 *   - Development without burning API credits
 *
 * The MockProvider is intentionally side-effect-free: it does not call the
 * network, does not require any credentials, and produces predictable outputs
 * based on the input messages.
 */
export declare class MockProvider implements ModelProvider {
    private readonly options;
    private callCount;
    constructor(options?: MockProviderOptions);
    /** Default responder: echo the last user message back in a structured way. */
    private defaultResponder;
    complete(prompt: Message[], _options?: CompletionOptions): Promise<CompletionResult>;
    stream(prompt: Message[], _options?: CompletionOptions): AsyncIterable<StreamChunk>;
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
}
/** Convenience: build a default mock provider for "no keys configured" runs. */
export declare function createDefaultMockProvider(): MockProvider;
//# sourceMappingURL=mock.d.ts.map