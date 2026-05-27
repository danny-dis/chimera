"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderConfigSchema = void 0;
const zod_1 = require("zod");
exports.ProviderConfigSchema = zod_1.z.object({
    name: zod_1.z.string(),
    provider: zod_1.z.string(),
    baseUrl: zod_1.z.string().optional(),
    model: zod_1.z.string(),
    apiKey: zod_1.z.string(),
    role: zod_1.z.enum(['writer', 'reviewer', 'challenger']),
    constraints: zod_1.z.object({
        maxTokensPerTurn: zod_1.z.number(),
        costCapPerTask: zod_1.z.number(),
        costCapPerSession: zod_1.z.number(),
        costCapPerDay: zod_1.z.number(),
        maxParallelInstances: zod_1.z.number(),
        rateLimitRpm: zod_1.z.number(),
    }),
});
//# sourceMappingURL=model-adapter.js.map