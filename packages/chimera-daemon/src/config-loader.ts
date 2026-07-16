// ---------------------------------------------------------------------------
// Config loader — reads .chimera/config.yaml from a workspace directory
// Shares the same schema as the CLI config-loader but operates on arbitrary paths
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import YAML from 'yaml';
import { listModels, recommendFromProviders, applyDmrxRouting } from '@chimera/providers';

// ---------------------------------------------------------------------------
// Schema (mirrors CLI config-loader)
// ---------------------------------------------------------------------------

const ProviderRoleSchema = z.enum(['writer', 'reviewer', 'challenger']);

const ProviderEntrySchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  role: ProviderRoleSchema,
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

const ChimeraConfigSchema = z.object({
  providers: z.array(ProviderEntrySchema).min(1),
  // `dmrx` rewrites every role's model to the DMR-X optimized meta-model
  // (auto-coding / auto-smart / auto-fast / auto-agentic). Provider entries
  // must already point at the DMR-X gateway. `direct` (or unset) = normal.
  backend: z.enum(['direct', 'dmrx']).optional(),
  defaults: z
    .object({
      fallback_chain: z.array(z.string()).optional(),
      auto_failover: z.boolean().optional(),
    })
    .optional(),
  fusion_mode: z.boolean().optional(),
  merge_mode: z.boolean().optional(),
});

export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type ChimeraConfig = z.infer<typeof ChimeraConfigSchema>;
export type ConfigProviderRole = 'writer' | 'reviewer' | 'challenger';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function configExists(cwd: string): boolean {
  return fs.existsSync(getConfigPath(cwd));
}

export function loadConfig(cwd: string): ChimeraConfig | null {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = YAML.parse(raw);
    const result = ChimeraConfigSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function saveConfig(config: unknown, cwd: string): void {
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
  const yaml = YAML.stringify(result.data, { indent: 2, lineWidth: 120 });
  fs.writeFileSync(configPath, yaml, 'utf-8');
}

function getConfigPath(cwd: string): string {
  return path.join(cwd, '.chimera', 'config.yaml');
}

function getEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function resolveEnvRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Support ${ENV_VAR} syntax
  const match = value.match(/^\$\{(\w+)\}$/);
  if (match) {
    return process.env[match[1]] || undefined;
  }
  return value;
}

export interface ResolvedProvider {
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  role: ConfigProviderRole;
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
  }));
}

/**
 * Get providers grouped by role.
 */
export function getProvidersByRole(
  config: ChimeraConfig,
  mode?: string,
): { writer?: ResolvedProvider; reviewer?: ResolvedProvider; challenger?: ResolvedProvider } {
  const routed = applyDmrxRouting(config, config.backend, mode).providers;
  const resolved = routed.map((p: ProviderEntry) => ({
    name: p.name,
    provider: p.provider,
    model: p.model,
    apiKey: resolveEnvRef(p.api_key),
    baseUrl: p.base_url,
    role: p.role,
  }));
  const byRole: { writer?: ResolvedProvider; reviewer?: ResolvedProvider; challenger?: ResolvedProvider } = {};
  for (const p of resolved) {
    if (p.role === 'writer') byRole.writer = p;
    else if (p.role === 'reviewer') byRole.reviewer = p;
    else if (p.role === 'challenger') byRole.challenger = p;
  }
  return byRole;
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

async function detectProvidersFromEnvAsync(): Promise<DetectedProvider[]> {
  const providers: DetectedProvider[] = [];

  const anthropicKey = getEnv('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    let model = getEnv('ANTHROPIC_MODEL');
    if (!model) {
      const available = await listModels('anthropic', anthropicKey);
      model = available[0] || DEFAULT_MODELS.anthropic;
    }
    providers.push({ name: 'anthropic', provider: 'anthropic', model, apiKey: anthropicKey });
  }

  const openaiKey = getEnv('OPENAI_API_KEY');
  if (openaiKey) {
    let model = getEnv('OPENAI_MODEL');
    if (!model) {
      const available = await listModels('openai', openaiKey);
      model = available[0] || DEFAULT_MODELS.openai;
    }
    providers.push({ name: 'openai', provider: 'openai', model, apiKey: openaiKey });
  }

  const googleKey = getEnv('GOOGLE_API_KEY');
  if (googleKey) {
    let model = getEnv('GOOGLE_MODEL');
    if (!model) {
      const available = await listModels('google', googleKey);
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
  if (perRoleResult.length > 0) return perRoleResult;

  return providers;
}

function detectPerRoleProviders(): DetectedProvider[] {
  const writerModel = getEnv('CHIMERA_WRITER_MODEL');
  const reviewerModel = getEnv('CHIMERA_REVIEWER_MODEL');
  const challengerModel = getEnv('CHIMERA_CHALLENGER_MODEL');

  if (!writerModel && !reviewerModel && !challengerModel) return [];

  const anthropicKey = getEnv('ANTHROPIC_API_KEY');
  const openaiKey = getEnv('OPENAI_API_KEY');
  const googleKey = getEnv('GOOGLE_API_KEY');

  let providerType: string;
  let apiKey: string | undefined;

  if (anthropicKey) {
    providerType = 'anthropic';
    apiKey = anthropicKey;
  } else if (openaiKey) {
    providerType = 'openai';
    apiKey = openaiKey;
  } else if (googleKey) {
    providerType = 'google';
    apiKey = googleKey;
  } else {
    return [];
  }

  const providers: DetectedProvider[] = [];

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
export async function autoGenerateConfig(cwd: string): Promise<ChimeraConfig | null> {
  const detected = await detectProvidersFromEnvAsync();
  if (detected.length === 0) return null;

  const providers: ProviderEntry[] = [];

  // Check if per-role providers were detected (names are 'writer', 'reviewer', 'challenger')
  const perRoleNames = new Set(['writer', 'reviewer', 'challenger']);
  const hasPerRole = detected.some((p) => perRoleNames.has(p.name));

  if (hasPerRole) {
    for (const p of detected) {
      const envKey =
        p.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
          : p.provider === 'openai' ? 'OPENAI_API_KEY'
            : p.provider === 'google' ? 'GOOGLE_API_KEY'
              : undefined;
      providers.push({
        name: p.name,
        provider: p.provider,
        model: p.model,
        api_key: envKey ? '\\${' + envKey + '}' : undefined,
        role: p.name as ConfigProviderRole,
      });
    }
  } else {
    // Standard mode: smartly auto-populate roles from the detected providers.
    // Single provider (e.g. the free CHIMERA_CHEAP slot) → assign it to all
    // three roles so the harness runs out-of-the-box. Multiple providers →
    // let the tier-aware recommender pick the strongest model per role.
    const roleToProvider = new Map<ConfigProviderRole, DetectedProvider>();

    if (detected.length === 1) {
      for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
        roleToProvider.set(role, detected[0]);
      }
    } else {
      const recommended = recommendFromProviders(detected.map((p) => p.provider));
      for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
        const modelId = recommended[role];
        const match = (modelId && detected.find((p) => p.model === modelId)) || detected[0];
        if (match) roleToProvider.set(role, match);
      }
    }

    const roleNames: Record<ConfigProviderRole, string> = {
      writer: 'primary',
      reviewer: 'secondary',
      challenger: 'tertiary',
    };
    for (const role of ['writer', 'reviewer', 'challenger'] as ConfigProviderRole[]) {
      const p = roleToProvider.get(role);
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

  const config: ChimeraConfig = { providers };
  saveConfig(config, cwd);
  return config;
}