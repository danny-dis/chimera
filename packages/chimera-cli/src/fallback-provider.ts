import { FallbackChain } from '@chimera/providers';
import type { ModelProvider, FallbackEvent } from '@chimera/providers';
import { adaptProvider, type LLMProvider } from '@chimera/core';

export function createFallbackProvider(
  providers: ModelProvider[],
  onFallback?: (event: FallbackEvent) => void,
): LLMProvider {
  const chain = new FallbackChain(providers);
  // FallbackChain has one event channel; registering three times duplicates each notice.
  if (onFallback) chain.on('fallback', onFallback);
  return adaptProvider({ complete: chain.complete.bind(chain) });
}
