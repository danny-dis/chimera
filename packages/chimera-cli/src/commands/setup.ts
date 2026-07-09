import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { recommendFromProviders } from '@chimera/providers';

// Providers the wizard can configure. `cheap` maps to the free NVIDIA
// openai-compatible slot (CHIMERA_CHEAP_API_KEY / _BASE_URL / _MODEL).
const PROVIDER_PRESETS: Record<
  string,
  { baseUrl: string; envKey: string; providerType: string }
> = {
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
const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'o3'],
  google: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  mistral: ['mistral-large-3', 'mistral-medium-3', 'codestral-latest'],
  openrouter: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-flash', 'deepseek/deepseek-v4'],
  cheap: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct'],
  ollama: ['llama3.1', 'codellama', 'mistral'],
};

interface SetupAnswers {
  providers: Array<{
    name: string;
    provider: string;
    model: string;
    api_key?: string;
    base_url?: string;
    role: 'writer' | 'reviewer' | 'challenger';
  }>;
  envVars: Record<string, string>;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(question);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    rl.question('  Enter number (or type a custom value): ', (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') return resolve(choices[0]!);
      const idx = parseInt(trimmed, 10) - 1;
      if (!Number.isNaN(idx) && choices[idx]) return resolve(choices[idx]!);
      resolve(trimmed); // treat as custom value
    });
  });
}

/**
 * Smart default per role: pick the strongest model across the providers the
 * user selected, using the tier-aware recommender. Returns a map role → modelId.
 */
function recommendedForRoles(selectedProviders: string[]): Record<string, string | undefined> {
  if (selectedProviders.length === 0) return {};
  if (selectedProviders.length === 1) {
    // Single provider → that provider's model is used for every role.
    const models = PROVIDER_MODELS[selectedProviders[0]!] ?? [];
    const model = models[0];
    return { writer: model, reviewer: model, challenger: model };
  }
  const rec = recommendFromProviders(selectedProviders);
  return { writer: rec.writer, reviewer: rec.reviewer, challenger: rec.challenger };
}

export async function runSetup(cwd?: string): Promise<boolean> {
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
    const preset = PROVIDER_PRESETS[selectedProvider]!;

    // 2. API key (if required).
    const envVars: Record<string, string> = {};
    let apiKey: string | undefined;
    if (preset.envKey) {
      const existingKey = process.env[preset.envKey] ?? '';
      const prompt = existingKey
        ? `  API key for ${selectedProvider} (current: ${existingKey.slice(0, 8)}..., press Enter to keep): `
        : `  API key for ${selectedProvider}: `;
      const key = await ask(rl, prompt);
      apiKey = key || existingKey;
      if (apiKey) envVars[preset.envKey] = apiKey;
    }

    // 3. Per-role model selection with smart auto-populate.
    const setupProviders: SetupAnswers['providers'] = [];
    const recommended = recommendedForRoles([selectedProvider]);
    const modelChoices = PROVIDER_MODELS[selectedProvider] ?? [];

    const roles: Array<'writer' | 'reviewer' | 'challenger'> = ['writer', 'reviewer', 'challenger'];
    for (const role of roles) {
      const suggested = recommended[role];
      const choices = suggested ? [suggested, ...modelChoices.filter((m) => m !== suggested)] : modelChoices;
      if (choices.length === 0) choices.push(''); // allow custom entry
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
    const yamlContent = YAML.stringify(config, { indent: 2, lineWidth: 120 });

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
      const newLines: string[] = [];
      for (const [key, value] of Object.entries(envVars)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(existingEnv)) {
          existingEnv = existingEnv.replace(regex, `${key}=${value}`);
        } else {
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
  } catch (err) {
    rl.close();
    throw err;
  }
}
