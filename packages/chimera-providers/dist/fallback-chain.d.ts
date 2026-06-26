import { Message, CompletionOptions, CompletionResult, StreamChunk, ModelProvider } from './types/provider.js';
export type FallbackEvent = {
    type: 'fallback';
    from: string;
    to: string;
    error: Error;
} | {
    type: 'circuit_open';
    provider: string;
    failures: number;
} | {
    type: 'circuit_closed';
    provider: string;
};
export type FallbackEventListener = (event: FallbackEvent) => void;
export declare class FallbackChain {
    private readonly providers;
    private readonly failureCounts;
    private readonly listeners;
    constructor(providers: ModelProvider[]);
    on(_event: FallbackEvent['type'], listener: FallbackEventListener): void;
    off(_listener: FallbackEventListener): void;
    complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult>;
    stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk>;
    private getAvailableProviders;
    private recordFailure;
    private resetFailures;
    private emit;
}
//# sourceMappingURL=fallback-chain.d.ts.map