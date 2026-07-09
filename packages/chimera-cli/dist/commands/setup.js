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
exports.runSetup = runSetup;
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const providers_1 = require("@chimera/providers");
// Providers the wizard can configure. `cheap` maps to the free NVIDIA
// openai-compatible slot (CHIMERA_CHEAP_API_KEY / _BASE_URL / _MODEL).
const PROVIDER_PRESETS = {
    anthropic: { baseUrl: 'https://api.anthropic.com', envKey: 'ANTHROPIC_API_KEY', providerType: 'anthropic' },
    openai: { baseUrl: 'https://api.openai.com', envKey: 'OPENAI_API_KEY', providerType: 'openai' },
    google: { baseUrl: 'https://generativelanguage.googleapis.com', envKey: 'GOOGLE_API_KEY', providerType: 'google' },
    mistral: { baseUrl: 'https://api.mistral.ai/v1', envKey: 'MISTRAL_API_KEY', providerType: 'mistral' },
    openrouter: { baseUrl: 'https://openrouter.ai/api', envKey: 'OPENROUTER_API_KEY', providerType: 'openai-compatible' },
    cheap: { baseUrl: 'https://integrate.api.nvidia.com/v1', envKey: 'CHIMERA_CHEAP_API_KEY', providerType: 'openai-compatible' },
    ollama: { baseUrl: 'http://localhost:11434', envKey: '', providerType: 'ollama' },
};
// A short, current model list per provider for quick picking. The wizard also
// accepts any custom model id the user types.
const PROVIDER_MODELS = {
    anthropic: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
    openai: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'o3'],
    google: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    mistral: ['mistral-large-3', 'mistral-medium-3', 'codestral-latest'],
    openrouter: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-flash', 'deepseek/deepseek-v4'],
    cheap: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct'],
    ollama: ['llama3.1', 'codellama', 'mistral'],
};
function ask(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}
function askChoice(rl, question, choices) {
    return new Promise((resolve) => {
        console.log(question);
        choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
        rl.question('  Enter number (or type a custom value): ', (answer) => {
            const trimmed = answer.trim();
            if (trimmed === '')
                return resolve(choices[0]);
            const idx = parseInt(trimmed, 10) - 1;
            if (!Number.isNaN(idx) && choices[idx])
                return resolve(choices[idx]);
            resolve(trimmed); // treat as custom value
        });
    });
}
/**
 * Smart default per role: pick the strongest model across the providers the
 * user selected, using the tier-aware recommender. Returns a map role → modelId.
 */
function recommendedForRoles(selectedProviders) {
    if (selectedProviders.length === 0)
        return {};
    if (selectedProviders.length === 1) {
        // Single provider → that provider's model is used for every role.
        const models = PROVIDER_MODELS[selectedProviders[0]] ?? [];
        const model = models[0];
        return { writer: model, reviewer: model, challenger: model };
    }
    const rec = (0, providers_1.recommendFromProviders)(selectedProviders);
    return { writer: rec.writer, reviewer: rec.reviewer, challenger: rec.challenger };
}
async function runSetup(cwd) {
    const base = cwd ?? process.cwd();
    const configDir = path.join(base, '.chimera');
    const configPath = path.join(configDir, 'config.yaml');
    const envPath = path.join(base, '.env');
    console.log('\n  Chimera Setup Wizard\n');
    console.log('  This will configure your providers, API keys, and per-role models.\n');
    console.log('  Smart defaults: Chimera auto-recommends the best model per role\n  (writer/reviewer get the strongest; challenger gets a distinct one).\n');
    console.log(`  Config: ${configPath}`);
    console.log(`  Env:    ${envPath}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        // 1. Choose which providers to configure.
        const providerNames = Object.keys(PROVIDER_PRESETS);
        console.log('  Which providers do you want to configure?');
        const selectedProvider = await askChoice(rl, '  Select a provider to set up (you can re-run setup for more):', providerNames);
        const preset = PROVIDER_PRESETS[selectedProvider];
        // 2. API key (if required).
        const envVars = {};
        let apiKey;
        if (preset.envKey) {
            const existingKey = process.env[preset.envKey] ?? '';
            const prompt = existingKey
                ? `  API key for ${selectedProvider} (current: ${existingKey.slice(0, 8)}..., press Enter to keep): `
                : `  API key for ${selectedProvider}: `;
            const key = await ask(rl, prompt);
            apiKey = key || existingKey;
            if (apiKey)
                envVars[preset.envKey] = apiKey;
        }
        // 3. Per-role model selection with smart auto-populate.
        const setupProviders = [];
        const recommended = recommendedForRoles([selectedProvider]);
        const modelChoices = PROVIDER_MODELS[selectedProvider] ?? [];
        const roles = ['writer', 'reviewer', 'challenger'];
        for (const role of roles) {
            const suggested = recommended[role];
            const choices = suggested ? [suggested, ...modelChoices.filter((m) => m !== suggested)] : modelChoices;
            if (choices.length === 0)
                choices.push(''); // allow custom entry
            const modelChoice = await askChoice(rl, `  [${role}] Select model (auto-recommended shown first):`, choices);
            const model = modelChoice || suggested || '';
            setupProviders.push({
                name: `${role}-${selectedProvider}`,
                provider: preset.providerType,
                model,
                api_key: preset.envKey ? '\\${' + preset.envKey + '}' : undefined,
                base_url: preset.providerType === 'ollama' ? undefined : preset.baseUrl,
                role,
            });
        }
        if (setupProviders.length === 0) {
            console.log('\n  No providers configured. Aborting.\n');
            rl.close();
            return false;
        }
        const config = { providers: setupProviders };
        const yamlContent = yaml_1.default.stringify(config, { indent: 2, lineWidth: 120 });
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, yamlContent, 'utf-8');
        console.log(`\n  ✓ Config written to ${configPath}`);
        if (Object.keys(envVars).length > 0) {
            let existingEnv = '';
            if (fs.existsSync(envPath)) {
                existingEnv = fs.readFileSync(envPath, 'utf-8');
            }
            const newLines = [];
            for (const [key, value] of Object.entries(envVars)) {
                const regex = new RegExp(`^${key}=.*$`, 'm');
                if (regex.test(existingEnv)) {
                    existingEnv = existingEnv.replace(regex, `${key}=${value}`);
                }
                else {
                    newLines.push(`${key}=${value}`);
                }
            }
            if (newLines.length > 0) {
                const separator = existingEnv.length > 0 && !existingEnv.endsWith('\n') ? '\n' : '';
                existingEnv += separator + newLines.join('\n') + '\n';
            }
            fs.writeFileSync(envPath, existingEnv, 'utf-8');
            console.log(`  ✓ API keys written to ${envPath}`);
        }
        console.log('\n  Setup complete! Run `chimera` to start.\n');
        console.log('  Tip: override any role later with CHIMERA_WRITER_MODEL /');
        console.log('       CHIMERA_REVIEWER_MODEL / CHIMERA_CHALLENGER_MODEL, or edit .chimera/config.yaml.\n');
        rl.close();
        return true;
    }
    catch (err) {
        rl.close();
        throw err;
    }
}
//# sourceMappingURL=setup.js.map