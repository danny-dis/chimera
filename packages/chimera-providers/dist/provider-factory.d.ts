import { z } from 'zod';
import { ProviderConfig } from './model-adapter.js';
import { ModelProvider } from './types/provider.js';
declare const EnvProviderConfigSchema: z.ZodObject<{
    provider: z.ZodEnum<["openai", "anthropic", "google", "ollama", "openai-compatible"]>;
    model: z.ZodString;
    baseUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    projectId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "openai-compatible";
    model: string;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    projectId?: string | undefined;
}, {
    provider: "google" | "openai" | "anthropic" | "ollama" | "openai-compatible";
    model: string;
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    projectId?: string | undefined;
}>;
type EnvProviderConfig = z.infer<typeof EnvProviderConfigSchema>;
export declare class ProviderFactory {
    static create(config: ProviderConfig): ModelProvider;
    static createFromEnv(overrides?: Partial<EnvProviderConfig>): ModelProvider[];
    static createSingle(overrides?: Partial<EnvProviderConfig>): ModelProvider;
    private static discoverEnvConfigs;
    private static buildProvider;
}
export {};
//# sourceMappingURL=provider-factory.d.ts.map