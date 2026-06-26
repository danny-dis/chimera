import { z } from 'zod';
import { ProviderConfig } from './model-adapter.js';
import { ModelProvider } from './types/provider.js';
declare const EnvProviderConfigSchema: z.ZodObject<{
    provider: z.ZodEnum<["openai", "anthropic", "google", "ollama", "openai-compatible", "mock"]>;
    model: z.ZodString;
    baseUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    projectId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "mock" | "openai-compatible";
    model: string;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    projectId?: string | undefined;
}, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "mock" | "openai-compatible";
    model: string;
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
export {};
//# sourceMappingURL=provider-factory.d.ts.map