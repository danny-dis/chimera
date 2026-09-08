/**
 * Embedding provider factory + pluggable providers.
 * 
 * To use a real embedding model (e.g., Qwen3-Embedding via Ollama):
 *   1. Install Ollama and run: ollama install qwen3-embedding-0.6b
 *   2. Set EMBEDDING_PROVIDER=ollama in environment
 *   3. The provider will be auto-selected at runtime
 * 
 * Falls back to LocalEmbeddingProvider (n-gram hashing) if no provider is configured.
 */
import { LocalEmbeddingProvider } from './vector-store.js';
import type { EmbeddingProvider } from './types.js';

export interface OllamaProviderConfig {
  endpoint?: string;
  model?: string;
  dimension?: number;
}

/**
 * Provider that calls a local Ollama embedding endpoint.
 * Zero-install fallback: if Ollama is not running, this will fail gracefully
 * and the caller should fall back to LocalEmbeddingProvider.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private endpoint: string;
  private model: string;
  private dim: number;

  constructor(config?: OllamaProviderConfig) {
    this.endpoint = config?.endpoint ?? process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';
    this.model = config?.model ?? process.env.OLLAMA_EMBEDDING_MODEL ?? 'qwen3-embedding-0.6b';
    this.dim = config?.dimension ?? 384;
  }

  dimension(): number {
    return this.dim;
  }

  async embed(text: string): Promise<Array<number>> {
    const res = await fetch(`${this.endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embedding failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { embedding: Array<number> };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<Array<number[]>> {
    const results: Array<number[]> = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

/**
 * Factory: selects the best available embedding provider.
 * Priority: Ollama (if configured) → LocalEmbeddingProvider (always works).
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  const providerType = process.env.EMBEDDING_PROVIDER?.toLowerCase();

  if (providerType === 'ollama') {
    return new OllamaEmbeddingProvider();
  }

  // Default: local n-gram hashing (no external dependencies)
  return new LocalEmbeddingProvider();
}

/**
 * Check if Ollama embedding is available without throwing.
 */
export async function isOllamaAvailable(endpoint = 'http://127.0.0.1:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
