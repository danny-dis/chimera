"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loopNodeConfigSchema = void 0;
/**
 * Zod schema for loop node configuration.
 * Ported from research/archon/packages/workflows/src/schemas/loop.ts @ 2026-06-15.
 */
const zod_1 = require("zod");
exports.loopNodeConfigSchema = zod_1.z
    .object({
    /** Inline prompt text executed each iteration. */
    prompt: zod_1.z.string().min(1, "loop node requires 'loop.prompt' (non-empty string)"),
    /** Completion signal string detected in AI output (e.g., "COMPLETE"). */
    until: zod_1.z.string().min(1, "loop node requires 'loop.until' (completion signal string)"),
    /** Maximum iterations allowed; exceeding this fails the node. */
    max_iterations: zod_1.z.number().int().positive("'loop.max_iterations' must be a positive integer"),
    /** Whether to start fresh session each iteration (default: false). */
    fresh_context: zod_1.z.boolean().default(false),
    /** Optional bash script run after each iteration; exit 0 = complete. */
    until_bash: zod_1.z.string().optional(),
    /** When true, pause between iterations for user input via /workflow approve. */
    interactive: zod_1.z.boolean().optional(),
    /** Message shown to user when paused (required when interactive is true). */
    gate_message: zod_1.z.string().optional(),
})
    .superRefine((data, ctx) => {
    if (data.interactive === true && !data.gate_message) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "interactive loop requires 'loop.gate_message' (non-empty string)",
            path: ['gate_message'],
        });
    }
});
//# sourceMappingURL=loop.js.map