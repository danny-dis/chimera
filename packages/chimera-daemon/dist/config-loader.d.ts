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
    role: "reviewer" | "challenger" | "writer";
    name: string;
    provider: string;
    model: string;
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
    role: "reviewer" | "challenger" | "writer";
    name: string;
    provider: string;
    model: string;
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
declare const ChimeraConfigSchema: z.ZodObject<{
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
        role: "reviewer" | "challenger" | "writer";
        name: string;
        provider: string;
        model: string;
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
        role: "reviewer" | "challenger" | "writer";
        name: string;
        provider: string;
        model: string;
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
        role: "reviewer" | "challenger" | "writer";
        name: string;
        provider: string;
        model: string;
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
        role: "reviewer" | "challenger" | "writer";
        name: string;
        provider: string;
        model: string;
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
export declare function configExists(cwd: string): boolean;
export declare function loadConfig(cwd: string): ChimeraConfig | null;
export declare function saveConfig(config: unknown, cwd: string): void;
/**
 * Auto-generate .chimera/config.yaml from environment variables.
 * Role assignment: first → writer, second → reviewer, third → challenger.
 * If only 1 provider → duplicate for writer + reviewer.
 */
export declare function autoGenerateConfig(cwd: string): Promise<ChimeraConfig | null>;
export {};
//# sourceMappingURL=config-loader.d.ts.map