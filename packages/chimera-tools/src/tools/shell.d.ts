import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const RunShellCommandParamsSchema: z.ZodObject<{
    command: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodDefault<z.ZodNumber>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    timeout: number;
    env?: Record<string, string> | undefined;
    cwd?: string | undefined;
}, {
    command: string;
    timeout?: number | undefined;
    env?: Record<string, string> | undefined;
    cwd?: string | undefined;
}>;
declare const RunShellCommandReturnsSchema: z.ZodObject<{
    stdout: z.ZodString;
    stderr: z.ZodString;
    exitCode: z.ZodNumber;
    duration: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
}, {
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
}>;
export declare const runShellCommandTool: ToolDefinition<typeof RunShellCommandParamsSchema, typeof RunShellCommandReturnsSchema>;
export {};
//# sourceMappingURL=shell.d.ts.map