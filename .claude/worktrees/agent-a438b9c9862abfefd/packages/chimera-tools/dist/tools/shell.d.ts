import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const RunShellCommandParamsSchema: z.ZodObject<{
    command: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodDefault<z.ZodNumber>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    command: string;
    cwd?: string | undefined;
    env?: Record<string, string> | undefined;
}, {
    command: string;
    cwd?: string | undefined;
    timeout?: number | undefined;
    env?: Record<string, string> | undefined;
}>;
declare const RunShellCommandReturnsSchema: z.ZodObject<{
    stdout: z.ZodString;
    stderr: z.ZodString;
    exitCode: z.ZodNumber;
    duration: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    duration: number;
    stdout: string;
    stderr: string;
    exitCode: number;
}, {
    duration: number;
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
export declare const runShellCommandTool: ToolDefinition<typeof RunShellCommandParamsSchema, typeof RunShellCommandReturnsSchema>;
export {};
//# sourceMappingURL=shell.d.ts.map