"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderConfigSchema = void 0;
const zod_1 = require("zod");
exports.ProviderConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1),
    baseUrl: zod_1.z.string().optional(),
    model: zod_1.z.string().min(1, 'model must not be empty'),
    // apiKey is optional because some local providers (Ollama) don't need one.
    // Length is checked at provider-construction time via resolveApiKey().
    apiKey: zod_1.z.string().optional(),
    role: zod_1.z.enum(['writer', 'reviewer', 'challenger']),
    /** Per-provider request timeout in milliseconds. Overrides the default (60s). */
    timeoutMs: zod_1.z.number().positive().optional(),
    constraints: zod_1.z.object({
        maxTokensPerTurn: zod_1.z.number().positive(),
        costCapPerTask: zod_1.z.number().nonnegative(),
        costCapPerSession: zod_1.z.number().nonnegative(),
        costCapPerDay: zod_1.z.number().nonnegative(),
        maxParallelInstances: zod_1.z.number().positive(),
        rateLimitRpm: zod_1.z.number().positive(),
    }),
    rateLimits: zod_1.z.object({
        rpm: zod_1.z.number().positive().optional(),
        tpm: zod_1.z.number().positive().optional(),
    }).optional(),
});
//# sourceMappingURL=model-adapter.js.map