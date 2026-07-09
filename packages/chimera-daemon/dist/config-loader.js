"use strict";
// ---------------------------------------------------------------------------
// Config loader — reads .chimera/config.yaml from a workspace directory
// Shares the same schema as the CLI config-loader but operates on arbitrary paths
// ---------------------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configExists = configExists;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.resolveProviders = resolveProviders;
exports.getProvidersByRole = getProvidersByRole;
exports.autoGenerateConfig = autoGenerateConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const yaml_1 = __importDefault(require("yaml"));
const providers_1 = require("@chimera/providers");
// ---------------------------------------------------------------------------
// Schema (mirrors CLI config-loader)
// ---------------------------------------------------------------------------
const ProviderRoleSchema = zod_1.z.enum(['writer', 'reviewer', 'challenger']);
const ProviderEntrySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    api_key: zod_1.z.string().optional(),
    base_url: zod_1.z.string().optional(),
    role: ProviderRoleSchema,
    constraints: zod_1.z
        .object({
        max_tokens_per_turn: zod_1.z.number().positive().optional(),
        cost_cap_per_task: zod_1.z.number().nonnegative().optional(),
        cost_cap_per_session: zod_1.z.number().nonnegative().optional(),
        cost_cap_per_day: zod_1.z.number().nonnegative().optional(),
        max_parallel_instances: zod_1.z.number().positive().optional(),
        rate_limit_rpm: zod_1.z.number().positive().optional(),
    })
        .optional(),
});
const ChimeraConfigSchema = zod_1.z.object({
    providers: zod_1.z.array(ProviderEntrySchema).min(1),
    defaults: zod_1.z
        .object({
        fallback_chain: zod_1.z.array(zod_1.z.string()).optional(),
        auto_failover: zod_1.z.boolean().optional(),
    })
        .optional(),
    fusion_mode: zod_1.z.boolean().optional(),
    merge_mode: zod_1.z.boolean().optional(),
});
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function configExists(cwd) {
    return fs.existsSync(getConfigPath(cwd));
}
function loadConfig(cwd) {
    const configPath = getConfigPath(cwd);
    if (!fs.existsSync(configPath))
        return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = yaml_1.default.parse(raw);
        const result = ChimeraConfigSchema.safeParse(parsed);
        if (!result.success)
            return null;
        return result.data;
    }
    catch {
        return null;
    }
}
function saveConfig(config, cwd) {
    const result = ChimeraConfigSchema.safeParse(config);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`Config validation failed: ${issues}`);
    }
    const configPath = getConfigPath(cwd);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const yaml = yaml_1.default.stringify(result.data, { indent: 2, lineWidth: 120 });
    fs.writeFileSync(configPath, yaml, 'utf-8');
}
function getConfigPath(cwd) {
    return path.join(cwd, '.chimera', 'config.yaml');
}
function getEnv(key) {
    const v = process.env[key];
    return v && v.length > 0 ? v : undefined;
}
function resolveEnvRef(value) {
    if (!value)
        return undefined;
    // Support ${ENV_VAR} syntax
    const match = value.match(/^\$\{(\w+)\}$/);
    if (match) {
        return process.env[match[1]] || undefined;
    }
    return value;
}
/**
 * Resolve all provider api_key references from environment variables.
 */
function resolveProviders(config) {
    return config.providers.map((p) => ({
        name: p.name,
        provider: p.provider,
        model: p.model,
        apiKey: resolveEnvRef(p.api_key),
        baseUrl: p.base_url,
        role: p.role,
    }));
}
/**
 * Get providers grouped by role.
 */
function getProvidersByRole(config) {
    const resolved = resolveProviders(config);
    const byRole = {};
    for (const p of resolved) {
        if (p.role === 'writer')
            byRole.writer = p;
        else if (p.role === 'reviewer')
            byRole.reviewer = p;
        else if (p.role === 'challenger')
            byRole.challenger = p;
    }
    return byRole;
}
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    google: 'gemini-2.5-flash',
};
async function detectProvidersFromEnvAsync() {
    const providers = [];
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    if (anthropicKey) {
        let model = getEnv('ANTHROPIC_MODEL');
        if (!model) {
            const available = await (0, providers_1.listModels)('anthropic', anthropicKey);
            model = available[0] || DEFAULT_MODELS.anthropic;
        }
        providers.push({ name: 'anthropic', provider: 'anthropic', model, apiKey: anthropicKey });
    }
    const openaiKey = getEnv('OPENAI_API_KEY');
    if (openaiKey) {
        let model = getEnv('OPENAI_MODEL');
        if (!model) {
            const available = await (0, providers_1.listModels)('openai', openaiKey);
            model = available[0] || DEFAULT_MODELS.openai;
        }
        providers.push({ name: 'openai', provider: 'openai', model, apiKey: openaiKey });
    }
    const googleKey = getEnv('GOOGLE_API_KEY');
    if (googleKey) {
        let model = getEnv('GOOGLE_MODEL');
        if (!model) {
            const available = await (0, providers_1.listModels)('google', googleKey);
            model = available[0] || DEFAULT_MODELS.google;
        }
        providers.push({ name: 'google', provider: 'google', model, apiKey: googleKey });
    }
    const ollamaModel = getEnv('OLLAMA_MODEL');
    if (ollamaModel) {
        providers.push({ name: 'ollama', provider: 'ollama', model: ollamaModel });
    }
    // Per-role env vars override
    const perRoleResult = detectPerRoleProviders();
    if (perRoleResult.length > 0)
        return perRoleResult;
    return providers;
}
function detectPerRoleProviders() {
    const writerModel = getEnv('CHIMERA_WRITER_MODEL');
    const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
    const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');
    if (!writerModel && !reviewerModel && !challengerModel)
        return [];
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    const openaiKey = getEnv('OPENAI_API_KEY');
    const googleKey = getEnv('GOOGLE_API_KEY');
    let providerType;
    let apiKey;
    if (anthropicKey) {
        providerType = 'anthropic';
        apiKey = anthropicKey;
    }
    else if (openaiKey) {
        providerType = 'openai';
        apiKey = openaiKey;
    }
    else if (googleKey) {
        providerType = 'google';
        apiKey = googleKey;
    }
    else {
        return [];
    }
    const providers = [];
    if (writerModel) {
        providers.push({ name: 'writer', provider: providerType, model: writerModel, apiKey });
    }
    if (reviewerModel) {
        providers.push({ name: 'reviewer', provider: providerType, model: reviewerModel, apiKey });
    }
    if (challengerModel) {
        providers.push({ name: 'challenger', provider: providerType, model: challengerModel, apiKey });
    }
    return providers;
}
/**
 * Auto-generate .chimera/config.yaml from environment variables.
 * Role assignment: first → writer, second → reviewer, third → challenger.
 * If only 1 provider → duplicate for writer + reviewer.
 */
async function autoGenerateConfig(cwd) {
    const detected = await detectProvidersFromEnvAsync();
    if (detected.length === 0)
        return null;
    const providers = [];
    // Check if per-role providers were detected (names are 'writer', 'reviewer', 'challenger')
    const perRoleNames = new Set(['writer', 'reviewer', 'challenger']);
    const hasPerRole = detected.some((p) => perRoleNames.has(p.name));
    if (hasPerRole) {
        for (const p of detected) {
            const envKey = p.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
                : p.provider === 'openai' ? 'OPENAI_API_KEY'
                    : p.provider === 'google' ? 'GOOGLE_API_KEY'
                        : undefined;
            providers.push({
                name: p.name,
                provider: p.provider,
                model: p.model,
                api_key: envKey ? '\\${' + envKey + '}' : undefined,
                role: p.name,
            });
        }
    }
    else {
        // Standard mode: smartly auto-populate roles from the detected providers.
        // Single provider (e.g. the free CHIMERA_CHEAP slot) → assign it to all
        // three roles so the harness runs out-of-the-box. Multiple providers →
        // let the tier-aware recommender pick the strongest model per role.
        const roleToProvider = new Map();
        if (detected.length === 1) {
            for (const role of ['writer', 'reviewer', 'challenger']) {
                roleToProvider.set(role, detected[0]);
            }
        }
        else {
            const recommended = (0, providers_1.recommendFromProviders)(detected.map((p) => p.provider));
            for (const role of ['writer', 'reviewer', 'challenger']) {
                const modelId = recommended[role];
                const match = (modelId && detected.find((p) => p.model === modelId)) || detected[0];
                if (match)
                    roleToProvider.set(role, match);
            }
        }
        const roleNames = {
            writer: 'primary',
            reviewer: 'secondary',
            challenger: 'tertiary',
        };
        for (const role of ['writer', 'reviewer', 'challenger']) {
            const p = roleToProvider.get(role);
            if (!p)
                continue;
            const envKey = p.provider === 'anthropic'
                ? 'ANTHROPIC_API_KEY'
                : p.provider === 'openai'
                    ? 'OPENAI_API_KEY'
                    : p.provider === 'google'
                        ? 'GOOGLE_API_KEY'
                        : p.provider === 'openai-compatible'
                            ? 'CHIMERA_CHEAP_API_KEY'
                            : undefined;
            providers.push({
                name: roleNames[role],
                provider: p.provider,
                model: p.model,
                api_key: envKey ? '\\${' + envKey + '}' : undefined,
                role,
            });
        }
    }
    if (providers.length === 1) {
        providers.push({ ...providers[0], name: 'secondary', role: 'reviewer' });
    }
    const config = { providers };
    saveConfig(config, cwd);
    return config;
}
//# sourceMappingURL=config-loader.js.map