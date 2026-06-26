import { z } from 'zod';
declare const SandboxTierSchema: z.ZodEnum<["process", "os", "container"]>;
declare const SandboxConfigSchema: z.ZodObject<{
    tier: z.ZodEnum<["process", "os", "container"]>;
    workspaceRoot: z.ZodString;
    networkEgress: z.ZodOptional<z.ZodBoolean>;
    maxMemoryMB: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    envFilter: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    workspaceRoot?: string;
    tier?: "process" | "os" | "container";
    networkEgress?: boolean;
    maxMemoryMB?: number;
    timeoutMs?: number;
    envFilter?: string[];
}, {
    workspaceRoot?: string;
    tier?: "process" | "os" | "container";
    networkEgress?: boolean;
    maxMemoryMB?: number;
    timeoutMs?: number;
    envFilter?: string[];
}>;
export type SandboxTier = z.infer<typeof SandboxTierSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export interface SandboxExecuteOptions {
    cwd?: string;
    timeoutMs?: number;
    maxMemoryMB?: number;
    networkEgress?: boolean;
    env?: Record<string, string>;
}
export interface SandboxResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    killed: boolean;
    oom: boolean;
}
export declare class Sandbox {
    private config;
    private envFilter;
    private ptyExecutor;
    private destroyed;
    constructor(config: SandboxConfig);
    execute(command: string, options?: SandboxExecuteOptions): Promise<SandboxResult>;
    destroy(): void;
    private buildEnv;
    private executeProcessTier;
    private executeOSTier;
    private executeMacOSSandbox;
    private executeLinuxSandbox;
    private executeContainerTier;
}
export {};
//# sourceMappingURL=sandbox.d.ts.map