"use strict";
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
exports.hasLegacyEnvVars = hasLegacyEnvVars;
exports.detectAvailableProviders = detectAvailableProviders;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const yaml_1 = __importDefault(require("yaml"));
const providers_1 = require("@chimera/providers");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const ProviderRoleSchema = zod_1.z.enum(['writer', 'reviewer', 'challenger']);
const ProviderEntrySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    api_key: zod_1.z.string().optional(),
    base_url: zod_1.z.string().optional(),
    role: ProviderRoleSchema,
    /** Per-provider request timeout in milliseconds. Overrides the default (60s). */
    timeout_ms: zod_1.z.number().positive().optional(),
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
const DefaultsSchema = zod_1.z
    .object({
    fallback_chain: zod_1.z.array(zod_1.z.string()).optional(),
    auto_failover: zod_1.z.boolean().optional(),
})
    .optional();
const ChimeraConfigSchema = zod_1.z
    .object({
    providers: zod_1.z.array(ProviderEntrySchema).min(1),
    defaults: DefaultsSchema,
    fusion_mode: zod_1.z.boolean().optional(),
    merge_mode: zod_1.z.boolean().optional(),
})
    .refine((data) => {
    if (data.fusion_mode) {
        return data.providers.length >= 3;
    }
    return true;
}, {
    message: "Fusion mode requires at least 3 providers defined.",
    path: ["providers"],
})
    .refine((data) => {
    if (data.merge_mode) {
        return data.providers.length >= 2;
    }
    return true;
}, {
    message: "Merge mode requires at least 2 providers for model routing.",
    path: ["providers"],
});
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONFIG_DIR = '.chimera';
const CONFIG_FILE = 'config.yaml';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getConfigPath(cwd) {
    const base = cwd ?? process.cwd();
    return path.join(base, CONFIG_DIR, CONFIG_FILE);
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
        if (!result.success) {
            console.error(`  ⚠ Invalid config in ${configPath}: ${result.error.message}`);
            return null;
        }
        return result.data;
    }
    catch (err) {
        console.error(`  ⚠ Failed to read config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
function saveConfig(config, cwd) {
    const configPath = getConfigPath(cwd);
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const yaml = yaml_1.default.stringify(config, { indent: 2, lineWidth: 120 });
    fs.writeFileSync(configPath, yaml, 'utf-8');
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
        timeoutMs: p.timeout_ms,
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
// ---------------------------------------------------------------------------
// Auto-generate config from environment variables
// ---------------------------------------------------------------------------
function getEnv(key) {
    const v = process.env[key];
    return v && v.length > 0 ? v : undefined;
}
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    google: 'gemini-2.5-flash',
};
function detectProvidersFromEnv() {
    const providers = [];
    // CHIMERA_CHEAP slot (openai-compatible)
    const cheapModel = getEnv('CHIMERA_CHEAP_MODEL');
    const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');
    const cheapApiKey = getEnv('CHIMERA_CHEAP_API_KEY');
    if (cheapModel && cheapBaseUrl && cheapApiKey) {
        providers.push({
            name: 'cheap',
            provider: 'openai-compatible',
            model: cheapModel,
            apiKey: cheapApiKey,
            baseUrl: cheapBaseUrl,
        });
    }
    // Anthropic — key alone is enough, model defaults to claude-sonnet-4
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    if (anthropicKey) {
        providers.push({
            name: 'anthropic',
            provider: 'anthropic',
            model: getEnv('ANTHROPIC_MODEL') || DEFAULT_MODELS.anthropic,
            apiKey: anthropicKey,
        });
    }
    // OpenAI — key alone is enough, model defaults to gpt-4o
    const openaiKey = getEnv('OPENAI_API_KEY');
    if (openaiKey) {
        providers.push({
            name: 'openai',
            provider: 'openai',
            model: getEnv('OPENAI_MODEL') || DEFAULT_MODELS.openai,
            apiKey: openaiKey,
        });
    }
    // Google — key alone is enough, model defaults to gemini-2.5-flash
    const googleKey = getEnv('GOOGLE_API_KEY');
    if (googleKey) {
        providers.push({
            name: 'google',
            provider: 'google',
            model: getEnv('GOOGLE_MODEL') || DEFAULT_MODELS.google,
            apiKey: googleKey,
        });
    }
    // Ollama (no key required)
    const ollamaModel = getEnv('OLLAMA_MODEL');
    if (ollamaModel) {
        providers.push({
            name: 'ollama',
            provider: 'ollama',
            model: ollamaModel,
        });
    }
    // Per-role env vars override: CHIMERA_WRITER_MODEL, CHIMERA_REVIEWER_MODEL, CHIMERA_CHALLENGER_MODEL
    // When set, these create entries using whichever API key is available, with the specified model.
    const perRoleResult = detectPerRoleProviders();
    if (perRoleResult.length > 0) {
        return perRoleResult;
    }
    return providers;
}
/**
 * Async version that fetches available models from provider APIs when no model is specified.
 * Falls back to DEFAULT_MODELS if the API call fails.
 */
async function detectProvidersFromEnvAsync() {
    const providers = [];
    // CHIMERA_CHEAP slot
    const cheapModel = getEnv('CHIMERA_CHEAP_MODEL');
    const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');
    const cheapApiKey = getEnv('CHIMERA_CHEAP_API_KEY');
    if (cheapModel && cheapBaseUrl && cheapApiKey) {
        providers.push({ name: 'cheap', provider: 'openai-compatible', model: cheapModel, apiKey: cheapApiKey, baseUrl: cheapBaseUrl });
    }
    // Anthropic — fetch models if no model specified
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    if (anthropicKey) {
        const specifiedModel = getEnv('ANTHROPIC_MODEL');
        let model = specifiedModel;
        if (!model) {
            const available = await (0, providers_1.listModels)('anthropic', anthropicKey);
            model = available[0] || DEFAULT_MODELS.anthropic;
        }
        providers.push({ name: 'anthropic', provider: 'anthropic', model, apiKey: anthropicKey });
    }
    // OpenAI — fetch models if no model specified
    const openaiKey = getEnv('OPENAI_API_KEY');
    if (openaiKey) {
        const specifiedModel = getEnv('OPENAI_MODEL');
        let model = specifiedModel;
        if (!model) {
            const available = await (0, providers_1.listModels)('openai', openaiKey);
            model = available[0] || DEFAULT_MODELS.openai;
        }
        providers.push({ name: 'openai', provider: 'openai', model, apiKey: openaiKey });
    }
    // Google — fetch models if no model specified
    const googleKey = getEnv('GOOGLE_API_KEY');
    if (googleKey) {
        const specifiedModel = getEnv('GOOGLE_MODEL');
        let model = specifiedModel;
        if (!model) {
            const available = await (0, providers_1.listModels)('google', googleKey);
            model = available[0] || DEFAULT_MODELS.google;
        }
        providers.push({ name: 'google', provider: 'google', model, apiKey: googleKey });
    }
    // Ollama
    const ollamaModel = getEnv('OLLAMA_MODEL');
    if (ollamaModel) {
        providers.push({ name: 'ollama', provider: 'ollama', model: ollamaModel });
    }
    // Per-role env vars override
    const perRoleResult = await detectPerRoleProvidersAsync();
    if (perRoleResult.length > 0)
        return perRoleResult;
    return providers;
}
async function detectPerRoleProvidersAsync() {
    const writerModel = getEnv('CHIMERA_WRITER_MODEL');
    const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
    const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');
    if (!writerModel && !reviewerModel && !challengerModel)
        return [];
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    const openaiKey = getEnv('OPENAI_API_KEY');
    const googleKey = getEnv('GOOGLE_API_KEY');
    const cheapKey = getEnv('CHIMERA_CHEAP_API_KEY');
    const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');
    let providerType;
    let apiKey;
    let baseUrl;
    if (anthropicKey) {
        providerType = 'anthropic';
        apiKey = anthropicKey;
    }
    else if (openaiKey) {
        providerType = 'openai';
        apiKey = openaiKey;
        baseUrl = 'https://api.openai.com';
    }
    else if (googleKey) {
        providerType = 'google';
        apiKey = googleKey;
    }
    else if (cheapKey) {
        providerType = 'openai-compatible';
        apiKey = cheapKey;
        baseUrl = cheapBaseUrl || 'https://integrate.api.nvidia.com/v1';
    }
    else {
        return [];
    }
    const providers = [];
    if (writerModel)
        providers.push({ name: 'writer', provider: providerType, model: writerModel, apiKey, baseUrl });
    if (reviewerModel)
        providers.push({ name: 'reviewer', provider: providerType, model: reviewerModel, apiKey, baseUrl });
    if (challengerModel)
        providers.push({ name: 'challenger', provider: providerType, model: challengerModel, apiKey, baseUrl });
    return providers;
}
/**
 * Detect per-role model overrides from CHIMERA_WRITER_MODEL / CHIMERA_REVIEWER_MODEL / CHIMERA_CHALLENGER_MODEL.
 * Returns an empty array if none are set (caller falls back to standard detection).
 */
function detectPerRoleProviders() {
    const writerModel = getEnv('CHIMERA_WRITER_MODEL');
    const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
    const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');
    if (!writerModel && !reviewerModel && !challengerModel)
        return [];
    // Resolve which provider type and API key to use
    const anthropicKey = getEnv('ANTHROPIC_API_KEY');
    const openaiKey = getEnv('OPENAI_API_KEY');
    const googleKey = getEnv('GOOGLE_API_KEY');
    const cheapKey = getEnv('CHIMERA_CHEAP_API_KEY');
    const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');
    let providerType;
    let apiKey;
    let baseUrl;
    if (anthropicKey) {
        providerType = 'anthropic';
        apiKey = anthropicKey;
    }
    else if (openaiKey) {
        providerType = 'openai';
        apiKey = openaiKey;
        baseUrl = 'https://api.openai.com';
    }
    else if (googleKey) {
        providerType = 'google';
        apiKey = googleKey;
    }
    else if (cheapKey) {
        // Allow per-role overrides to ride on the existing NIM / openai-compatible
        // slot (CHIMERA_CHEAP_API_KEY + CHIMERA_CHEAP_BASE_URL) so a stronger model
        // can be targeted without an Anthropic/OpenAI/Google key.
        providerType = 'openai-compatible';
        apiKey = cheapKey;
        baseUrl = cheapBaseUrl || 'https://integrate.api.nvidia.com/v1';
    }
    else {
        return [];
    }
    const providers = [];
    if (writerModel) {
        providers.push({ name: 'writer', provider: providerType, model: writerModel, apiKey, baseUrl });
    }
    if (reviewerModel) {
        providers.push({ name: 'reviewer', provider: providerType, model: reviewerModel, apiKey, baseUrl });
    }
    if (challengerModel) {
        providers.push({ name: 'challenger', provider: providerType, model: challengerModel, apiKey, baseUrl });
    }
    return providers;
}
/**
 * Auto-generate .chimera/config.yaml from environment variables.
 *
 * Role assignment by convention:
 *   - CHIMERA_CHEAP_* → writer
 *   - First remaining frontier key → reviewer
 *   - Second remaining frontier key → challenger
 *   - If only 1 key → same model for writer + reviewer, no challenger
 */
async function autoGenerateConfig(cwd) {
    const detected = await detectProvidersFromEnvAsync();
    if (detected.length === 0)
        return null;
    const providers = [];
    const usedNames = new Set();
    function makeName(base) {
        if (!usedNames.has(base)) {
            usedNames.add(base);
            return base;
        }
        let i = 2;
        while (usedNames.has(`${base}-${i}`))
            i++;
        const name = `${base}-${i}`;
        usedNames.add(name);
        return name;
    }
    // Check if per-role providers were detected (names are 'writer', 'reviewer', 'challenger')
    const perRoleNames = new Set(['writer', 'reviewer', 'challenger']);
    const hasPerRole = detected.some((p) => perRoleNames.has(p.name));
    if (hasPerRole) {
        // Per-role mode: use the detected names directly as roles
        for (const p of detected) {
            const envKey = p.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
                : p.provider === 'openai' ? 'OPENAI_API_KEY'
                    : p.provider === 'google' ? 'GOOGLE_API_KEY'
                        : p.provider === 'openai-compatible' ? 'CHIMERA_CHEAP_API_KEY'
                            : undefined;
            providers.push({
                name: makeName(p.name),
                provider: p.provider,
                model: p.model,
                api_key: envKey ? `\${${envKey}}` : undefined,
                base_url: p.baseUrl,
                role: p.name,
            });
        }
    }
    else {
        // Standard mode: assign roles by convention
        const cheapIdx = detected.findIndex((p) => p.name === 'cheap');
        if (cheapIdx !== -1) {
            const p = detected[cheapIdx];
            providers.push({
                name: makeName('primary'),
                provider: p.provider,
                model: p.model,
                api_key: p.apiKey ? `\${${p.name === 'cheap' ? 'CHIMERA_CHEAP_API_KEY' : p.provider.toUpperCase() + '_API_KEY'}}` : undefined,
                base_url: p.baseUrl,
                role: 'writer',
            });
            detected.splice(cheapIdx, 1);
        }
        // Remaining providers: first → reviewer, second → challenger
        const roles = ['reviewer', 'challenger'];
        for (let i = 0; i < detected.length && i < 2; i++) {
            const p = detected[i];
            const envKey = p.name === 'anthropic'
                ? 'ANTHROPIC_API_KEY'
                : p.name === 'openai'
                    ? 'OPENAI_API_KEY'
                    : p.name === 'google'
                        ? 'GOOGLE_API_KEY'
                        : p.name === 'ollama'
                            ? undefined
                            : undefined;
            providers.push({
                name: makeName(i === 0 ? 'secondary' : 'tertiary'),
                provider: p.provider,
                model: p.model,
                api_key: envKey ? `\${${envKey}}` : undefined,
                role: roles[i],
            });
        }
    }
    // If only 1 provider total (no cheap, no extras), duplicate for writer + reviewer
    if (providers.length === 1) {
        const only = providers[0];
        providers.push({
            ...only,
            name: makeName('secondary'),
            role: 'reviewer',
        });
    }
    const config = { providers };
    saveConfig(config, cwd);
    return config;
}
/**
 * Detect if legacy env vars are set (for backward-compat check).
 */
function hasLegacyEnvVars() {
    return !!(getEnv('CHIMERA_CHEAP_API_KEY') ||
        getEnv('ANTHROPIC_API_KEY') ||
        getEnv('OPENAI_API_KEY') ||
        getEnv('GOOGLE_API_KEY') ||
        getEnv('OLLAMA_MODEL'));
}
/**
 * Scan env vars and return detected providers (for setup wizard).
 */
function detectAvailableProviders() {
    return detectProvidersFromEnv();
}
//# sourceMappingURL=config-loader.js.map