import {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ModelProvider,
} from './types/provider.js';
import {
  ProviderError,
  RateLimitError,
  ProviderUnavailableError,
} from './errors.js';

export type FallbackEvent =
  | { type: 'fallback'; from: string; to: string; error: Error }
  | { type: 'circuit_open'; provider: string; failures: number }
  | { type: 'circuit_closed'; provider: string };

export type FallbackEventListener = (event: FallbackEvent) => void;

const CIRCUIT_BREAKER_THRESHOLD = 3;

function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ProviderUnavailableError) return true;
  if (error instanceof ProviderError) {
    return (error.statusCode ?? 0) >= 500;
  }
  return false;
}

export class FallbackChain {
  private readonly providers: ModelProvider[];
  private readonly failureCounts = new Map<string, number>();
  private readonly listeners: FallbackEventListener[] = [];

  constructor(providers: ModelProvider[]) {
    if (providers.length === 0) {
      throw new ProviderError('FallbackChain requires at least one provider');
    }
    this.providers = providers;
  }

  on(_event: FallbackEvent['type'], listener: FallbackEventListener): void {
    this.listeners.push(listener);
  }

  off(_listener: FallbackEventListener): void {
    const index = this.listeners.indexOf(_listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  async complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    const available = this.getAvailableProviders();

    for (let i = 0; i < available.length; i++) {
      const provider = available[i];
      const name = provider.getModel().id;

      try {
        const result = await provider.complete(prompt, options);
        this.resetFailures(name);
        return result;
      } catch (error) {
        if (!isRetryableError(error)) {
          throw error;
        }

        this.recordFailure(name);

        const nextProvider = available[i + 1];
        if (nextProvider) {
          const nextName = nextProvider.getModel().id;
          this.emit({
            type: 'fallback',
            from: name,
            to: nextName,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }

    throw new ProviderUnavailableError(
      `All ${available.length} providers in fallback chain failed`,
    );
  }

  async *stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk> {
    const available = this.getAvailableProviders();

    for (let i = 0; i < available.length; i++) {
      const provider = available[i];
      const name = provider.getModel().id;

      try {
        let yielded = false;
        for await (const chunk of provider.stream(prompt, options)) {
          yielded = true;
          yield chunk;
        }
        if (yielded) {
          this.resetFailures(name);
        }
        return;
      } catch (error) {
        if (!isRetryableError(error)) {
          throw error;
        }

        this.recordFailure(name);

        const nextProvider = available[i + 1];
        if (nextProvider) {
          const nextName = nextProvider.getModel().id;
          this.emit({
            type: 'fallback',
            from: name,
            to: nextName,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }

    throw new ProviderUnavailableError(
      `All ${available.length} providers in fallback chain failed`,
    );
  }

  private getAvailableProviders(): ModelProvider[] {
    return this.providers.filter((p) => {
      const name = p.getModel().id;
      const failures = this.failureCounts.get(name) ?? 0;
      return failures < CIRCUIT_BREAKER_THRESHOLD;
    });
  }

  private recordFailure(name: string): void {
    const count = (this.failureCounts.get(name) ?? 0) + 1;
    this.failureCounts.set(name, count);

    if (count === CIRCUIT_BREAKER_THRESHOLD) {
      this.emit({ type: 'circuit_open', provider: name, failures: count });
    }
  }

  private resetFailures(name: string): void {
    const previous = this.failureCounts.get(name) ?? 0;
    if (previous > 0) {
      this.failureCounts.set(name, 0);
      this.emit({ type: 'circuit_closed', provider: name });
    }
  }

  private emit(event: FallbackEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
