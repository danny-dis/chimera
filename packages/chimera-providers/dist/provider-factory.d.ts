import { z } from 'zod';
import { ProviderConfig } from './model-adapter.js';
import { ModelProvider } from './types/provider.js';
declare const EnvProviderConfigSchema: z.ZodObject<{
    provider: z.ZodEnum<["openai", "anthropic", "google", "ollama", "openai-compatible", "mock"]>;
    model: z.ZodString;
    baseUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    projectId: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "mock" | "openai-compatible";
    model: string;
    timeoutMs?: number | undefined;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    projectId?: string | undefined;
}, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "mock" | "openai-compatible";
    model: string;
    timeoutMs?: number | undefined;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    projectId?: string | undefined;
}>;
type EnvProviderConfig = z.infer<typeof EnvProviderConfigSchema>;
export declare class ProviderFactory {
    static create(config: ProviderConfig): ModelProvider;
    static createFromEnv(overrides?: Partial<EnvProviderConfig>): ModelProvider[];
    /**
     * Convenience: build a single provider from env, or fall back to a mock.
     * Use this when you need exactly one provider and don't want to handle
     * the "no config" error case.
     */
    static createFromEnvOrMock(overrides?: Partial<EnvProviderConfig>): ModelProvider;
    static createSingle(overrides?: Partial<EnvProviderConfig>): ModelProvider;
    private static discoverEnvConfigs;
    private static buildProvider;
}
/**
 * Fetch available model IDs from a provider's API.
 * Returns model ID strings, or an empty array on failure.
 */
export declare function listModels(provider: string, apiKey: string): Promise<string[]>;
import { ModelRegistry } from './model-registry.js';
/**
 * Get the default ModelRegistry instance.
 * The registry automatically loads cached model metadata from disk on construction.
 * This provides a singleton registry with dynamically updated context windows and pricing.
 *
 * @example
 * ```typescript
 * import { getDefaultRegistry } from '@chimera/providers';
 *
 * const registry = getDefaultRegistry();
 * const model = registry.get('anthropic/claude-sonnet-4-20250514');
 * console.log(model?.contextWindow); // Uses cached value if available
 *
 * // Refresh from API
 * await registry.refreshFromAPI();
 * ```
 */
export declare function getDefaultRegistry(): ModelRegistry;
/**
 * Reset the default registry (useful for testing).
 */
export declare function resetDefaultRegistry(): void;
export {};
//# sourceMappingURL=provider-factory.d.ts.map