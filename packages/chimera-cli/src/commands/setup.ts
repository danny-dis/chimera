import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

const PROVIDER_PRESETS: Record<string, { baseUrl: string; models: string[]; envKey: string }> = {
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
    rl.question('  Enter number: ', (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      resolve(choices[idx] ?? choices[0]!);
    });
  });
}

export async function runSetup(cwd?: string): Promise<boolean> {
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
    const roles: Array<'writer' | 'reviewer' | 'challenger'> = ['writer', 'reviewer', 'challenger'];
    const setupProviders: SetupAnswers['providers'] = [];
    const envVars: Record<string, string> = {};

    for (const role of roles) {
      console.log(`\n  --- ${role.toUpperCase()} provider ---`);
      const configure = await ask(rl, `  Configure ${role}? (Y/n): `);
      if (configure.toLowerCase() === 'n') continue;

      const providerNames = Object.keys(PROVIDER_PRESETS);
      const providerChoice = await askChoice(rl, `  Select provider for ${role}:`, providerNames);
      const preset = PROVIDER_PRESETS[providerChoice]!;

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
    rl.close();
    return true;
  } catch (err) {
    rl.close();
    throw err;
  }
}
