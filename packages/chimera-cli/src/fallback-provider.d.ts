import type { ModelProvider, FallbackEvent } from '@chimera/providers';
import type { LLMProvider } from '@chimera/core';
/**
 * Wraps a FallbackChain as an LLMProvider so the orchestrator can use it
 * transparently. When the primary provider hits a rate limit or goes down,
 * the FallbackChain automatically retries on the next provider in the list.
 *
 * The `adaptProvider` bridge (messages + tool calls) is the same one used
 * by `cli-router.ts` for single providers — we just delegate to the chain
 * instead of a single ModelProvider.
 */
export declare function createFallbackProvider(providers: ModelProvider[], onFallback?: (event: FallbackEvent) => void): LLMProvider;
//# sourceMappingURL=fallback-provider.d.ts.map