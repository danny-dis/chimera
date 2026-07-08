"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stepRetryConfigSchema = void 0;
/**
 * Zod schema for step retry configuration.
 * Ported from research/archon/packages/workflows/src/schemas/retry.ts @ 2026-06-15.
 */
const zod_1 = require("zod");
exports.stepRetryConfigSchema = zod_1.z.object({
    /** Maximum retry attempts (not including the initial attempt). 1-5. */
    max_attempts: zod_1.z
        .number()
        .int()
        .min(1, "'retry.max_attempts' must be between 1 and 5")
        .max(5, "'retry.max_attempts' must be between 1 and 5"),
    /** Initial delay in ms, doubled on each attempt. 1000-60000. */
    delay_ms: zod_1.z
        .number()
        .min(1000, "'retry.delay_ms' must be a number between 1000 and 60000")
        .max(60000, "'retry.delay_ms' must be a number between 1000 and 60000")
        .optional(),
    /** Which error types trigger a retry. Default: 'transient'. */
    on_error: zod_1.z.enum(['transient', 'all']).optional(),
});
//# sourceMappingURL=retry.js.map