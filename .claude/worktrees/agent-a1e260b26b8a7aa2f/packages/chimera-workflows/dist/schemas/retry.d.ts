/**
 * Zod schema for step retry configuration.
 * Ported from research/archon/packages/workflows/src/schemas/retry.ts @ 2026-06-15.
 */
import { z } from 'zod';
export declare const stepRetryConfigSchema: z.ZodObject<{
    /** Maximum retry attempts (not including the initial attempt). 1-5. */
    max_attempts: z.ZodNumber;
    /** Initial delay in ms, doubled on each attempt. 1000-60000. */
    delay_ms: z.ZodOptional<z.ZodNumber>;
    /** Which error types trigger a retry. Default: 'transient'. */
    on_error: z.ZodOptional<z.ZodEnum<["transient", "all"]>>;
}, "strip", z.ZodTypeAny, {
    max_attempts: number;
    delay_ms?: number | undefined;
    on_error?: "transient" | "all" | undefined;
}, {
    max_attempts: number;
    delay_ms?: number | undefined;
    on_error?: "transient" | "all" | undefined;
}>;
export type StepRetryConfig = z.infer<typeof stepRetryConfigSchema>;
//# sourceMappingURL=retry.d.ts.map