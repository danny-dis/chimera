import { z } from 'zod';
import type { LspWorkspaceConfig } from './types.js';
export declare const LspServerConfigSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
    filePatterns: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    rootFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    diagnosticsLimit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    command: string;
    args: string[];
    filePatterns: string[];
    rootFiles: string[];
    enabled: boolean;
    name?: string | undefined;
    cwd?: string | undefined;
    env?: Record<string, string> | undefined;
    diagnosticsLimit?: number | undefined;
}, {
    command: string;
    name?: string | undefined;
    args?: string[] | undefined;
    cwd?: string | undefined;
    filePatterns?: string[] | undefined;
    rootFiles?: string[] | undefined;
    env?: Record<string, string> | undefined;
    enabled?: boolean | undefined;
    diagnosticsLimit?: number | undefined;
}>;
export declare const LspConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    autoStart: z.ZodDefault<z.ZodBoolean>;
    diagnosticsLimit: z.ZodDefault<z.ZodNumber>;
    servers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        cwd: z.ZodOptional<z.ZodString>;
        filePatterns: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        rootFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        diagnosticsLimit: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        args: string[];
        filePatterns: string[];
        rootFiles: string[];
        enabled: boolean;
        name?: string | undefined;
        cwd?: string | undefined;
        env?: Record<string, string> | undefined;
        diagnosticsLimit?: number | undefined;
    }, {
        command: string;
        name?: string | undefined;
        args?: string[] | undefined;
        cwd?: string | undefined;
        filePatterns?: string[] | undefined;
        rootFiles?: string[] | undefined;
        env?: Record<string, string> | undefined;
        enabled?: boolean | undefined;
        diagnosticsLimit?: number | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    diagnosticsLimit: number;
    autoStart: boolean;
    servers: Record<string, {
        command: string;
        args: string[];
        filePatterns: string[];
        rootFiles: string[];
        enabled: boolean;
        name?: string | undefined;
        cwd?: string | undefined;
        env?: Record<string, string> | undefined;
        diagnosticsLimit?: number | undefined;
    }>;
}, {
    enabled?: boolean | undefined;
    diagnosticsLimit?: number | undefined;
    autoStart?: boolean | undefined;
    servers?: Record<string, {
        command: string;
        name?: string | undefined;
        args?: string[] | undefined;
        cwd?: string | undefined;
        filePatterns?: string[] | undefined;
        rootFiles?: string[] | undefined;
        env?: Record<string, string> | undefined;
        enabled?: boolean | undefined;
        diagnosticsLimit?: number | undefined;
    }> | undefined;
}>;
export declare const DEFAULT_LSP_CONFIG: LspWorkspaceConfig;
export declare function loadLspConfig(workspaceRoot: string, configPath?: string): Promise<LspWorkspaceConfig>;
export declare function mergeLspConfig(base: LspWorkspaceConfig, override?: Partial<LspWorkspaceConfig>): LspWorkspaceConfig;
//# sourceMappingURL=config.d.ts.map