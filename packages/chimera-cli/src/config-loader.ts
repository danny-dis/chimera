import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import YAML from 'yaml';
import { listModels, recommendFromProviders } from '@chimera/providers';
import type { DeliberationMode } from '@chimera/core';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ProviderRoleSchema = z.enum(['writer', 'reviewer', 'challenger']);

const ProviderEntrySchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  role: ProviderRoleSchema,
  /** Per-provider request timeout in milliseconds. Overrides the default (60s). */
  timeout_ms: z.number().positive().optional(),
  constraints: z
    .object({
      max_tokens_per_turn: z.number().positive().optional(),
      cost_cap_per_task: z.number().nonnegative().optional(),
      cost_cap_per_session: z.number().nonnegative().optional(),
      cost_cap_per_day: z.number().nonnegative().optional(),
      max_parallel_instances: z.number().positive().optional(),
      rate_limit_rpm: z.number().positive().optional(),
    })
    .optional(),
});

const DefaultsSchema = z
  .object({
    fallback_chain: z.array(z.string()).optional(),
    auto_failover: z.boolean().optional(),
    preset: z.enum(['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm']).optional(),
  })
  .optional();

const ChimeraConfigSchema = z
  .object({
    providers: z.array(ProviderEntrySchema).min(1),
    defaults: DefaultsSchema,
    fusion_mode: z.boolean().optional(),
    merge_mode: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.fusion_mode) {
        return data.providers.length >= 3;
      }
      return true;
    },
    {
      message: "Fusion mode requires at least 3 providers defined.",
      path: ["providers"],
    }
  )
  .refine(
    (data) => {
      if (data.merge_mode) {
        return data.providers.length >= 2;
      }
      return true;
    },
    {
      message: "Merge mode requires at least 2 providers for model routing.",
      path: ["providers"],
    }
  );

export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type ChimeraConfig = z.infer<typeof ChimeraConfigSchema>;

export type ConfigProviderRole = 'writer' | 'reviewer' | 'challenger';

// ---------------------------------------------------------------------------
// Resolved provider — apiKey resolved from env var reference
// ---------------------------------------------------------------------------

export interface ResolvedProvider {
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  role: ConfigProviderRole;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DIR = '.chimera';
const CONFIG_FILE = 'config.yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfigPath(cwd?: string): string {
  const base = cwd ?? process.cwd();
  return path.join(base, CONFIG_DIR, CONFIG_FILE);
}

function resolveEnvRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Support ${ENV_VAR} (and the backslash-escaped \${ENV_VAR} form written by
  // autoGenerateConfig / the setup wizard) so the literal reference resolves
  // to the real environment value at runtime.
  const match = value.match(/^\\?\${([\w]+)}$/);
  if (match) {
    return process.env[match[1]] || undefined;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function configExists(cwd?: string): boolean {
  return fs.existsSync(getConfigPath(cwd));
}

export function loadConfig(cwd?: string): ChimeraConfig | null {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = YAML.parse(raw);
    const result = ChimeraConfigSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`  ⚠ Invalid config in ${configPath}: ${result.error.message}`);
      return null;
    }
    return result.data;
  } catch (err) {
    console.error(
      `  ⚠ Failed to read config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * The preset from `defaults.preset` in .chimera/config.yaml, if set.
 * Used to seed the initial preset for the legacy REPL and the plain
 * `ask`/`plan` subcommands. Explicit `--preset` overrides it.
 */
export function getDefaultPreset(): DeliberationMode | undefined {
  return loadConfig()?.defaults?.preset;
}

export function saveConfig(config: ChimeraConfig, cwd?: string): void {
  const configPath = getConfigPath(cwd);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const yaml = YAML.stringify(config, { indent: 2, lineWidth: 120 });
  fs.writeFileSync(configPath, yaml, 'utf-8');
}

/**
 * Resolve all provider api_key references from environment variables.
 */
export function resolveProviders(config: ChimeraConfig): ResolvedProvider[] {
  return config.providers.map((p: ProviderEntry) => ({
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
export function getProvidersByRole(
  config: ChimeraConfig,
): { writer?: ResolvedProvider; reviewer?: ResolvedProvider; challenger?: ResolvedProvider } {
  const resolved = resolveProviders(config);
  const byRole: { writer?: ResolvedProvider; reviewer?: ResolvedProvider; challenger?: ResolvedProvider } = {};
  for (const p of resolved) {
    if (p.role === 'writer') byRole.writer = p;
    else if (p.role === 'reviewer') byRole.reviewer = p;
    else if (p.role === 'challenger') byRole.challenger = p;
  }
  return byRole;
}

// ---------------------------------------------------------------------------
// Auto-generate config from environment variables
// ---------------------------------------------------------------------------

function getEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

interface DetectedProvider {
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.5-flash',
};

function detectProvidersFromEnv(): DetectedProvider[] {
  const providers: DetectedProvider[] = [];

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
      apiKey: getEnv('GOOGLE_API_KEY'),
    });
  }

  // OpenRouter — openai-compatible gateway to hundreds of models (incl. Google
  // Gemma, which excels at agentic work). Key alone is enough; model defaults
  // to a Gemma variant when OPENROUTER_MODEL is unset.
  const openrouterKey = getEnv('OPENROUTER_API_KEY');
  if (openrouterKey) {
    providers.push({
      name: 'openrouter',
      provider: 'openai-compatible',
      model: getEnv('OPENROUTER_MODEL') || 'google/gemma-3-27b-it',
      apiKey: getEnv('OPENROUTER_API_KEY'),
      baseUrl: 'https://openrouter.ai/api',
    });
  }

  // Ollama (no key required) — set OLLAMA_MODEL to override auto-detection
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
async function detectProvidersFromEnvAsync(): Promise<DetectedProvider[]> {
  const providers: DetectedProvider[] = [];

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
      const available = await listModels('anthropic', anthropicKey);
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
      const available = await listModels('openai', openaiKey);
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
      const available = await listModels('google', googleKey);
      model = available[0] || DEFAULT_MODELS.google;
    }
    providers.push({ name: 'google', provider: 'google', model, apiKey: getEnv('GOOGLE_API_KEY') });
  }

  // OpenRouter — openai-compatible gateway (incl. Gemma). Key alone is enough.
  const openrouterKey = getEnv('OPENROUTER_API_KEY');
  if (openrouterKey) {
    const specifiedModel = getEnv('OPENROUTER_MODEL');
    providers.push({
      name: 'openrouter',
      provider: 'openai-compatible',
      model: specifiedModel || 'google/gemma-3-27b-it',
      apiKey: getEnv('OPENROUTER_API_KEY'),
      baseUrl: 'https://openrouter.ai/api',
    });
  }

  // Ollama — zero-config: if a local Ollama server is running, use it with
  // whatever model the user already pulled. No env var, no key, no config.
  const ollamaModel = getEnv('OLLAMA_MODEL') ?? (await detectLocalOllamaModel());
  if (ollamaModel) {
    providers.push({
      name: 'ollama',
      provider: 'ollama',
      model: ollamaModel,
    });
  }

  // Per-role env vars override
  const perRoleResult = await detectPerRoleProvidersAsync();
  if (perRoleResult.length > 0) return perRoleResult;

  return providers;
}

async function detectPerRoleProvidersAsync(): Promise<DetectedProvider[]> {
  const writerModel = getEnv('CHIMERA_WRITER_MODEL');
  const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
  const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');

  if (!writerModel && !reviewerModel && !challengerModel) return [];

  const anthropicKey = getEnv('ANTHROPIC_API_KEY');
  const openaiKey = getEnv('OPENAI_API_KEY');
  const googleKey = getEnv('GOOGLE_API_KEY');
  const cheapKey = getEnv('CHIMERA_CHEAP_API_KEY');
  const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');

  let providerType: string;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (anthropicKey) {
    providerType = 'anthropic';
    apiKey = anthropicKey;
  } else if (openaiKey) {
    providerType = 'openai';
    apiKey = openaiKey;
    baseUrl = 'https://api.openai.com';
  } else if (googleKey) {
    providerType = 'google';
    apiKey = googleKey;
  } else if (cheapKey) {
    providerType = 'openai-compatible';
    apiKey = cheapKey;
    baseUrl = cheapBaseUrl || 'https://integrate.api.nvidia.com/v1';
  } else {
    return [];
  }

  const providers: DetectedProvider[] = [];
  if (writerModel) providers.push({ name: 'writer', provider: providerType, model: writerModel, apiKey, baseUrl });
  if (reviewerModel) providers.push({ name: 'reviewer', provider: providerType, model: reviewerModel, apiKey, baseUrl });
  if (challengerModel) providers.push({ name: 'challenger', provider: providerType, model: challengerModel, apiKey, baseUrl });

  return providers;
}

/**
 * Detect per-role model overrides from CHIMERA_WRITER_MODEL / CHIMERA_REVIEWER_MODEL / CHIMERA_CHALLENGER_MODEL.
 * Returns an empty array if none are set (caller falls back to standard detection).
 */
function detectPerRoleProviders(): DetectedProvider[] {
  const writerModel = getEnv('CHIMERA_WRITER_MODEL');
  const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
  const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');

  if (!writerModel && !reviewerModel && !challengerModel) return [];

  // Resolve which provider type and API key to use
  const anthropicKey = getEnv('ANTHROPIC_API_KEY');
  const openaiKey = getEnv('OPENAI_API_KEY');
  const googleKey = getEnv('GOOGLE_API_KEY');
  const cheapKey = getEnv('CHIMERA_CHEAP_API_KEY');
  const cheapBaseUrl = getEnv('CHIMERA_CHEAP_BASE_URL');

  let providerType: string;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (anthropicKey) {
    providerType = 'anthropic';
    apiKey = anthropicKey;
  } else if (openaiKey) {
    providerType = 'openai';
    apiKey = openaiKey;
    baseUrl = 'https://api.openai.com';
  } else if (googleKey) {
    providerType = 'google';
    apiKey = googleKey;
  } else if (cheapKey) {
    // Allow per-role overrides to ride on the existing NIM / openai-compatible
    // slot (CHIMERA_CHEAP_API_KEY + CHIMERA_CHEAP_BASE_URL) so a stronger model
    // can be targeted without an Anthropic/OpenAI/Google key.
    providerType = 'openai-compatible';
    apiKey = cheapKey;
    baseUrl = cheapBaseUrl || 'https://integrate.api.nvidia.com/v1';
  } else {
    return [];
  }

  const providers: DetectedProvider[] = [];

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
export async function autoGenerateConfig(cwd?: string): Promise<ChimeraConfig | null> {
  const detected = await detectProvidersFromEnvAsync();
  if (detected.length === 0) return null;

  const providers: ProviderEntry[] = [];
  const usedNames = new Set<string>();

  function makeName(base: string): string {
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    let i = 2;
    while (usedNames.has(`${base}-${i}`)) i++;
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
      const envKey =
        p.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
          : p.provider === 'openai' ? 'OPENAI_API_KEY'
            : p.provider === 'google' ? 'GOOGLE_API_KEY'
              : p.provider === 'openai-compatible' ? 'CHIMERA_CHEAP_API_KEY'
                : undefined;
      providers.push({
        name: makeName(p.name),
        provider: p.provider,
        model: p.model,
        api_key: envKey ? '\\${' + envKey + '}' : undefined,
        base_url: p.baseUrl,
        role: p.name as ConfigProviderRole,
      });
    }
  } else {
    // Standard mode: smartly auto-populate roles from the detected models.
    // The user can override any role later via CHIMERA_WRITER_MODEL /
    // CHIMERA_REVIEWER_MODEL / CHIMERA_CHALLENGER_MODEL or by editing
    // .chimera/config.yaml.
    const roleToDetected = new Map<ConfigProviderRole, DetectedProvider>();

    if (detected.length === 1) {
      // Single provider (e.g. the free CHIMERA_CHEAP slot) → assign it to
      // all three roles so the harness runs out-of-the-box on the free model.
      for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
        roleToDetected.set(role, detected[0]);
      }
    } else {
      // Multiple providers: let the tier-aware recommender pick the strongest
      // model per role from the providers the user actually configured.
      const recommended = recommendFromProviders(detected.map((p) => p.provider));
      for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
        const modelId = recommended[role];
        const match =
          (modelId && detected.find((p) => p.model === modelId)) || detected[0];
        if (match) roleToDetected.set(role, match);
      }
    }

    const roleNames: Record<ConfigProviderRole, string> = {
      writer: 'primary',
      reviewer: 'secondary',
      challenger: 'tertiary',
    };

    for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
      const p = roleToDetected.get(role);
      if (!p) continue;
      const envKey =
        p.provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : p.provider === 'openai'
            ? 'OPENAI_API_KEY'
            : p.provider === 'google'
              ? 'GOOGLE_API_KEY'
              : p.provider === 'openai-compatible'
                ? 'CHIMERA_CHEAP_API_KEY'
                : undefined;
      providers.push({
        name: makeName(roleNames[role]),
        provider: p.provider,
        model: p.model,
        api_key: envKey ? '\\${' + envKey + '}' : undefined,
        base_url: p.baseUrl,
        role,
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

  const config: ChimeraConfig = { providers };
  saveConfig(config, cwd);
  return config;
}

/**
 * Detect if legacy env vars are set (for backward-compat check).
 */
export function hasLegacyEnvVars(): boolean {
  return !!(
    getEnv('CHIMERA_CHEAP_API_KEY') ||
    getEnv('ANTHROPIC_API_KEY') ||
    getEnv('OPENAI_API_KEY') ||
    getEnv('GOOGLE_API_KEY') ||
    getEnv('OLLAMA_MODEL')
  );
}

/**
 * Scan env vars and return detected providers (for setup wizard).
 */
export function detectAvailableProviders(): DetectedProvider[] {
  return detectProvidersFromEnv();
}

/**
 * Zero-config local provider: probe a running Ollama server and return the
 * first pulled model name, or undefined if none is reachable. Model-agnostic
 * — uses whatever the user already has locally, so a beginner with
 * `ollama pull llama3` running needs no env var, key, or config.
 */
async function detectLocalOllamaModel(): Promise<string | undefined> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return data.models?.[0]?.name;
  } catch {
    // ponytail: best-effort probe; server down / not installed = no local model
    return undefined;
  }
}
