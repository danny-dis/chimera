/**
 * Zod schema for loop node configuration.
 * Ported from research/archon/packages/workflows/src/schemas/loop.ts @ 2026-06-15.
 */
import { z } from 'zod';
export declare const loopNodeConfigSchema: z.ZodEffects<z.ZodObject<{
    /** Inline prompt text executed each iteration. */
    prompt: z.ZodString;
    /** Completion signal string detected in AI output (e.g., "COMPLETE"). */
    until: z.ZodString;
    /** Maximum iterations allowed; exceeding this fails the node. */
    max_iterations: z.ZodNumber;
    /** Whether to start fresh session each iteration (default: false). */
    fresh_context: z.ZodDefault<z.ZodBoolean>;
    /** Optional bash script run after each iteration; exit 0 = complete. */
    until_bash: z.ZodOptional<z.ZodString>;
    /** When true, pause between iterations for user input via /workflow approve. */
    interactive: z.ZodOptional<z.ZodBoolean>;
    /** Message shown to user when paused (required when interactive is true). */
    gate_message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    until: string;
    max_iterations: number;
    fresh_context: boolean;
    until_bash?: string | undefined;
    interactive?: boolean | undefined;
    gate_message?: string | undefined;
}, {
    prompt: string;
    until: string;
    max_iterations: number;
    fresh_context?: boolean | undefined;
    until_bash?: string | undefined;
    interactive?: boolean | undefined;
    gate_message?: string | undefined;
}>, {
    prompt: string;
    until: string;
    max_iterations: number;
    fresh_context: boolean;
    until_bash?: string | undefined;
    interactive?: boolean | undefined;
    gate_message?: string | undefined;
}, {
    prompt: string;
    until: string;
    max_iterations: number;
    fresh_context?: boolean | undefined;
    until_bash?: string | undefined;
    interactive?: boolean | undefined;
    gate_message?: string | undefined;
}>;
export type LoopNodeConfig = z.infer<typeof loopNodeConfigSchema>;
//# sourceMappingURL=loop.d.ts.map