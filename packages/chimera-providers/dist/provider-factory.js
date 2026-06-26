"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFactory = void 0;
exports.listModels = listModels;
const zod_1 = require("zod");
const model_adapter_js_1 = require("./model-adapter.js");
const errors_js_1 = require("./errors.js");
const openai_compatible_js_1 = require("./providers/openai-compatible.js");
const anthropic_js_1 = require("./providers/anthropic.js");
const google_js_1 = require("./providers/google.js");
const ollama_js_1 = require("./providers/ollama.js");
const mock_js_1 = require("./providers/mock.js");
const ProviderTypeSchema = zod_1.z.enum([
    'openai',
    'anthropic',
    'google',
    'ollama',
    'openai-compatible',
    'mock',
]);
const EnvProviderConfigSchema = zod_1.z.object({
    provider: ProviderTypeSchema,
    model: zod_1.z.string(),
    baseUrl: zod_1.z.string().optional(),
    apiKey: zod_1.z.string().optional(),
    projectId: zod_1.z.string().optional(),
});
function getEnv(key) {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    return undefined;
}
function resolveApiKey(config) {
    if (config.apiKey)
        return config.apiKey;
    const keyMap = {
        openai: 'OPENAI_API_KEY',
        'openai-compatible': 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        google: 'GOOGLE_API_KEY',
    };
    const envKey = keyMap[config.provider];
    const key = envKey ? getEnv(envKey) : undefined;
    if (!key) {
        throw new errors_js_1.InvalidConfigError(`No API key provided for ${config.provider}. Set ${envKey} or pass apiKey in config.`, config.provider);
    }
    return key;
}
function resolveBaseUrl(config) {
    if (config.baseUrl)
        return config.baseUrl;
    const urlMap = {
        openai: 'https://api.openai.com',
        anthropic: 'https://api.anthropic.com',
        google: 'https://generativelanguage.googleapis.com',
        ollama: 'http://localhost:11434',
    };
    const url = urlMap[config.provider];
    if (!url) {
        throw new errors_js_1.InvalidConfigError(`No default base URL for provider: ${config.provider}`, config.provider);
    }
    return url;
}
class ProviderFactory {
    static create(config) {
        const parsed = model_adapter_js_1.ProviderConfigSchema.safeParse(config);
        if (!parsed.success) {
            throw new errors_js_1.InvalidConfigError(`Invalid provider config: ${parsed.error.message}`, config.provider);
        }
        return this.buildProvider({
            provider: config.provider,
            model: config.model,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
        });
    }
    static createFromEnv(overrides) {
        const providers = [];
        const candidates = this.discoverEnvConfigs(overrides);
        for (const candidate of candidates) {
            try {
                const provider = this.buildProvider(candidate);
                providers.push(provider);
            }
            catch {
                // Skip providers with missing credentials
            }
        }
        // If no real provider could be built, fall back to the offline MockProvider
        // so CLI smoke tests and "first run" experience still work without keys.
        if (providers.length === 0) {
            providers.push((0, mock_js_1.createDefaultMockProvider)());
        }
        return providers;
    }
    /**
     * Convenience: build a single provider from env, or fall back to a mock.
     * Use this when you need exactly one provider and don't want to handle
     * the "no config" error case.
     */
    static createFromEnvOrMock(overrides) {
        const providers = this.createFromEnv(overrides);
        return providers[0];
    }
    static createSingle(overrides) {
        const candidates = this.discoverEnvConfigs(overrides);
        if (candidates.length === 0) {
            // No real provider configured — fall back to the offline mock so the CLI
            // can still run end-to-end (useful for CI, dev, and "first run" UX).
            return (0, mock_js_1.createDefaultMockProvider)();
        }
        return this.buildProvider(candidates[0]);
    }
    static discoverEnvConfigs(overrides) {
        const configs = [];
        const providerConfigs = [
            { provider: 'anthropic', modelEnv: 'ANTHROPIC_MODEL', baseUrl: 'https://api.anthropic.com' },
            { provider: 'openai', modelEnv: 'OPENAI_MODEL', baseUrl: 'https://api.openai.com' },
            { provider: 'google', modelEnv: 'GOOGLE_MODEL', baseUrl: 'https://generativelanguage.googleapis.com' },
            { provider: 'ollama', modelEnv: 'OLLAMA_MODEL', baseUrl: 'http://localhost:11434' },
        ];
        for (const pc of providerConfigs) {
            const model = getEnv(pc.modelEnv);
            const apiKey = pc.provider === 'ollama' ? undefined : getEnv(`${pc.provider.toUpperCase()}_API_KEY`);
            if (model) {
                configs.push({
                    provider: pc.provider,
                    model,
                    baseUrl: pc.baseUrl,
                    apiKey: apiKey ?? undefined,
                });
            }
        }
        if (overrides) {
            const merged = {
                provider: overrides.provider ?? configs[0]?.provider ?? 'openai',
                model: overrides.model ?? configs[0]?.model ?? 'gpt-4o',
                baseUrl: overrides.baseUrl,
                apiKey: overrides.apiKey,
                projectId: overrides.projectId,
            };
            configs.unshift(merged);
        }
        return configs;
    }
    static buildProvider(config) {
        const parsed = EnvProviderConfigSchema.safeParse(config);
        if (!parsed.success) {
            throw new errors_js_1.InvalidConfigError(`Invalid env config: ${parsed.error.message}`, config.provider);
        }
        switch (config.provider) {
            case 'anthropic': {
                const anthropicConfig = {
                    apiKey: resolveApiKey(config),
                    model: config.model,
                };
                return new anthropic_js_1.AnthropicProvider(anthropicConfig);
            }
            case 'google': {
                const googleConfig = {
                    apiKey: resolveApiKey(config),
                    model: config.model,
                    projectId: config.projectId,
                };
                return new google_js_1.GoogleProvider(googleConfig);
            }
            case 'ollama': {
                const ollamaConfig = {
                    baseUrl: resolveBaseUrl(config),
                    model: config.model,
                };
                return new ollama_js_1.OllamaProvider(ollamaConfig);
            }
            case 'openai':
            case 'openai-compatible': {
                const openaiConfig = {
                    baseUrl: resolveBaseUrl(config),
                    apiKey: resolveApiKey(config),
                    model: config.model,
                };
                return new openai_compatible_js_1.OpenAICompatibleProvider(openaiConfig);
            }
            case 'mock': {
                return (0, mock_js_1.createDefaultMockProvider)();
            }
            default:
                throw new errors_js_1.InvalidConfigError(`Unknown provider type: ${config.provider}`, config.provider);
        }
    }
}
exports.ProviderFactory = ProviderFactory;
/**
 * Fetch available model IDs from a provider's API.
 * Returns model ID strings, or an empty array on failure.
 */
async function listModels(provider, apiKey) {
    try {
        switch (provider) {
            case 'openai':
                return await listOpenAIModels(apiKey);
            case 'google':
                return await listGoogleModels(apiKey);
            case 'anthropic':
                return listAnthropicModels();
            case 'ollama':
                return await listOllamaModels();
            default:
                return [];
        }
    }
    catch {
        return [];
    }
}
async function listOpenAIModels(apiKey) {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
        return [];
    const data = await res.json();
    return (data.data ?? [])
        .map((m) => m.id)
        .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4'));
}
async function listGoogleModels(apiKey) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
        return [];
    const data = await res.json();
    return (data.models ?? [])
        .map((m) => m.name.replace('models/', ''))
        .filter((id) => id.startsWith('gemini-'));
}
function listAnthropicModels() {
    return [
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
    ];
}
async function listOllamaModels() {
    const res = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok)
        return [];
    const data = await res.json();
    return (data.models ?? []).map((m) => m.name);
}
//# sourceMappingURL=provider-factory.js.map