import { z } from 'zod';
declare const ProviderEntrySchema: z.ZodObject<{
    name: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
    api_key: z.ZodOptional<z.ZodString>;
    base_url: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["writer", "reviewer", "challenger"]>;
    constraints: z.ZodOptional<z.ZodObject<{
        max_tokens_per_turn: z.ZodOptional<z.ZodNumber>;
        cost_cap_per_task: z.ZodOptional<z.ZodNumber>;
        cost_cap_per_session: z.ZodOptional<z.ZodNumber>;
        cost_cap_per_day: z.ZodOptional<z.ZodNumber>;
        max_parallel_instances: z.ZodOptional<z.ZodNumber>;
        rate_limit_rpm: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        max_tokens_per_turn?: number | undefined;
        cost_cap_per_task?: number | undefined;
        cost_cap_per_session?: number | undefined;
        cost_cap_per_day?: number | undefined;
        max_parallel_instances?: number | undefined;
        rate_limit_rpm?: number | undefined;
    }, {
        max_tokens_per_turn?: number | undefined;
        cost_cap_per_task?: number | undefined;
        cost_cap_per_session?: number | undefined;
        cost_cap_per_day?: number | undefined;
        max_parallel_instances?: number | undefined;
        rate_limit_rpm?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "writer" | "reviewer" | "challenger";
    provider: string;
    model: string;
    name: string;
    api_key?: string | undefined;
    base_url?: string | undefined;
    constraints?: {
        max_tokens_per_turn?: number | undefined;
        cost_cap_per_task?: number | undefined;
        cost_cap_per_session?: number | undefined;
        cost_cap_per_day?: number | undefined;
        max_parallel_instances?: number | undefined;
        rate_limit_rpm?: number | undefined;
    } | undefined;
}, {
    role: "writer" | "reviewer" | "challenger";
    provider: string;
    model: string;
    name: string;
    api_key?: string | undefined;
    base_url?: string | undefined;
    constraints?: {
        max_tokens_per_turn?: number | undefined;
        cost_cap_per_task?: number | undefined;
        cost_cap_per_session?: number | undefined;
        cost_cap_per_day?: number | undefined;
        max_parallel_instances?: number | undefined;
        rate_limit_rpm?: number | undefined;
    } | undefined;
}>;
declare const ChimeraConfigSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    providers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        provider: z.ZodString;
        model: z.ZodString;
        api_key: z.ZodOptional<z.ZodString>;
        base_url: z.ZodOptional<z.ZodString>;
        role: z.ZodEnum<["writer", "reviewer", "challenger"]>;
        constraints: z.ZodOptional<z.ZodObject<{
            max_tokens_per_turn: z.ZodOptional<z.ZodNumber>;
            cost_cap_per_task: z.ZodOptional<z.ZodNumber>;
            cost_cap_per_session: z.ZodOptional<z.ZodNumber>;
            cost_cap_per_day: z.ZodOptional<z.ZodNumber>;
            max_parallel_instances: z.ZodOptional<z.ZodNumber>;
            rate_limit_rpm: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        }, {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }, {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }>, "many">;
    defaults: z.ZodOptional<z.ZodObject<{
        fallback_chain: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        auto_failover: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    }, {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    }>>;
    fusion_mode: z.ZodOptional<z.ZodBoolean>;
    merge_mode: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}>, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}>, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}, {
    providers: {
        role: "writer" | "reviewer" | "challenger";
        provider: string;
        model: string;
        name: string;
        api_key?: string | undefined;
        base_url?: string | undefined;
        constraints?: {
            max_tokens_per_turn?: number | undefined;
            cost_cap_per_task?: number | undefined;
            cost_cap_per_session?: number | undefined;
            cost_cap_per_day?: number | undefined;
            max_parallel_instances?: number | undefined;
            rate_limit_rpm?: number | undefined;
        } | undefined;
    }[];
    defaults?: {
        fallback_chain?: string[] | undefined;
        auto_failover?: boolean | undefined;
    } | undefined;
    fusion_mode?: boolean | undefined;
    merge_mode?: boolean | undefined;
}>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type ChimeraConfig = z.infer<typeof ChimeraConfigSchema>;
export type ConfigProviderRole = 'writer' | 'reviewer' | 'challenger';
export interface ResolvedProvider {
    name: string;
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    role: ConfigProviderRole;
}
export declare function configExists(cwd?: string): boolean;
export declare function loadConfig(cwd?: string): ChimeraConfig | null;
export declare function saveConfig(config: ChimeraConfig, cwd?: string): void;
/**
 * Resolve all provider api_key references from environment variables.
 */
export declare function resolveProviders(config: ChimeraConfig): ResolvedProvider[];
/**
 * Get providers grouped by role.
 */
export declare function getProvidersByRole(config: ChimeraConfig): {
    writer?: ResolvedProvider;
    reviewer?: ResolvedProvider;
    challenger?: ResolvedProvider;
};
interface DetectedProvider {
    name: string;
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
}
/**
 * Auto-generate .chimera/config.yaml from environment variables.
 *
 * Role assignment by convention:
 *   - CHIMERA_CHEAP_* → writer
 *   - First remaining frontier key → reviewer
 *   - Second remaining frontier key → challenger
 *   - If only 1 key → same model for writer + reviewer, no challenger
 */
export declare function autoGenerateConfig(cwd?: string): Promise<ChimeraConfig | null>;
/**
 * Detect if legacy env vars are set (for backward-compat check).
 */
export declare function hasLegacyEnvVars(): boolean;
/**
 * Scan env vars and return detected providers (for setup wizard).
 */
export declare function detectAvailableProviders(): DetectedProvider[];
export {};
//# sourceMappingURL=config-loader.d.ts.map