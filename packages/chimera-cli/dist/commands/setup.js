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
const PROVIDER_PRESETS = {
    anthropic: {
        baseUrl: 'https://api.anthropic.com',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-20240307'],
        envKey: 'ANTHROPIC_API_KEY',
    },
    openai: {
        baseUrl: 'https://api.openai.com',
        models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
        envKey: 'OPENAI_API_KEY',
    },
    google: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        envKey: 'GOOGLE_API_KEY',
    },
    mistral: {
        baseUrl: 'https://api.mistral.ai',
        models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
        envKey: 'MISTRAL_API_KEY',
    },
    openrouter: {
        baseUrl: 'https://openrouter.ai/api',
        models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-flash'],
        envKey: 'OPENROUTER_API_KEY',
    },
    ollama: {
        baseUrl: 'http://localhost:11434',
        models: ['llama3.1', 'codellama', 'mistral'],
        envKey: '',
    },
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
        rl.question('  Enter number: ', (answer) => {
            const idx = parseInt(answer.trim(), 10) - 1;
            resolve(choices[idx] ?? choices[0]);
        });
    });
}
async function runSetup(cwd) {
    const base = cwd ?? process.cwd();
    const configDir = path.join(base, '.chimera');
    const configPath = path.join(configDir, 'config.yaml');
    const envPath = path.join(base, '.env');
    console.log('\n  Chimera Setup Wizard\n');
    console.log('  This will configure your providers and API keys.\n');
    console.log(`  Config: ${configPath}`);
    console.log(`  Env:    ${envPath}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const roles = ['writer', 'reviewer', 'challenger'];
        const setupProviders = [];
        const envVars = {};
        for (const role of roles) {
            console.log(`\n  --- ${role.toUpperCase()} provider ---`);
            const configure = await ask(rl, `  Configure ${role}? (Y/n): `);
            if (configure.toLowerCase() === 'n')
                continue;
            const providerNames = Object.keys(PROVIDER_PRESETS);
            const providerChoice = await askChoice(rl, `  Select provider for ${role}:`, providerNames);
            const preset = PROVIDER_PRESETS[providerChoice];
            const modelChoice = await askChoice(rl, `  Select model:`, preset.models);
            let apiKey = '';
            if (preset.envKey) {
                const existingKey = process.env[preset.envKey] ?? '';
                const prompt = existingKey
                    ? `  API key for ${providerChoice} (current: ${existingKey.slice(0, 8)}..., press Enter to keep): `
                    : `  API key for ${providerChoice}: `;
                const key = await ask(rl, prompt);
                apiKey = key || existingKey;
                if (apiKey) {
                    envVars[preset.envKey] = apiKey;
                }
            }
            setupProviders.push({
                name: `${role}-${providerChoice}`,
                provider: providerChoice === 'ollama' ? 'ollama' : providerChoice === 'google' ? 'google' : 'openai-compatible',
                model: modelChoice,
                api_key: preset.envKey ? `\${${preset.envKey}}` : undefined,
                base_url: providerChoice === 'ollama' ? undefined : preset.baseUrl,
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
        rl.close();
        return true;
    }
    catch (err) {
        rl.close();
        throw err;
    }
}
//# sourceMappingURL=setup.js.map