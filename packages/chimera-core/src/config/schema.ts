/**
 * @chimera/core — Config schema and validation
 *
 * Zod schemas for `~/.chimera/config.yaml` (and `.archon/config.yaml` for
 * Archon backward-compat).  Covers every top-level key, sub-section, and
 * leaf value that `packages/chimera-cli/src/config-loader.ts` and
 * `packages/chimera-daemon/src/config-loader.ts` read.
 *
 * Validation errors use the pattern:
 *   `"field.name must be <constraint>, got: <value>"`
 * so callers can report human-readable messages to the user.
 *
 * Public API:
 *   - `chimeraConfigSchema`  — full Zod schema (useful for `zod` inference)
 *   - `validateConfig(data)` — returns `{ ok: true, data: T } | { ok: false, errors: string[] }`
 *   - `loadAndValidate(path)` — reads YAML, validates, returns same shape
 */

import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';

// ---------------------------------------------------------------------------
// Shared enum schemas (mirrors patterns in chimera-workflows)
// ---------------------------------------------------------------------------

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export type LogLevel = z.infer<typeof LogLevelSchema>;

// ---------------------------------------------------------------------------
// Top-level section schemas
// ---------------------------------------------------------------------------

/** Provider-specific settings (per-provider config). */
export const RawProviderSchema = z.object({
  /** OpenAI-compatible base API URL */
  baseUrl: z.string().url().optional(),
  /** API key (read from env in production; stored in config only for local dev) */
  apiKey: z.string().min(1).optional(),
  /** Default model ID for this provider */
  model: z.string().min(1).optional(),
  /** Request timeout in milliseconds */
  timeout: z.number().int().min(1).optional(),
  /** Maximum number of retries on transient failures */
  retries: z.number().int().min(0).max(20).optional(),
  /** Per-request token limit (model context window) */
  maxTokens: z.number().int().min(1).optional(),
  /** Temperature (0-2) */
  temperature: z.number().min(0).max(2).optional(),
  /** Presence penalty (-2 to 2) */
  presencePenalty: z.number().min(-2).max(2).optional(),
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty: z.number().min(-2).max(2).optional(),
});

export type RawProvider = z.infer<typeof RawProviderSchema>;

/** Provider name → provider config mapping. */
export const RawProvidersSchema = z.record(z.string(), RawProviderSchema);

export type RawProviders = z.infer<typeof RawProvidersSchema>;

/** AI profile: per-profile provider overrides. */
export const RawAiProfileSchema = z.object({
  /** Provider name (e.g., "openai", "anthropic") */
  provider: z.string().min(1),
  /** Model ID (e.g., "gpt-4o", "claude-3-opus") */
  model: z.string().min(1),
  /** Max tokens for this profile */
  maxTokens: z.number().int().min(1).optional(),
  /** Temperature for this profile */
  temperature: z.number().min(0).max(2).optional(),
  /** Optional API key override for this profile */
  apiKey: z.string().min(1).optional(),
  /** Optional base URL override */
  baseUrl: z.string().url().optional(),
});

export type RawAiProfile = z.infer<typeof RawAiProfileSchema>;

/** AI section: default profile + named profile overrides. */
export const RawAiSchema = z.object({
  /** Default AI profile name */
  defaultProfile: z.string().min(1).optional(),
  /** Named AI profiles */
  profiles: z.record(z.string(), RawAiProfileSchema).optional(),
  /** Global provider settings */
  providers: RawProvidersSchema.optional(),
});

export type RawAi = z.infer<typeof RawAiSchema>;

/** Rate limit bucket configuration. */
export const RawRateLimitSchema = z.object({
  /** Maximum requests per minute (positive integer) */
  rpm: z.number().int().min(1),
  /** Maximum tokens per minute (positive integer) */
  tpm: z.number().int().min(1),
  /** Maximum requests per hour (positive integer) */
  rph: z.number().int().min(1).optional(),
  /** Maximum tokens per hour (positive integer) */
  tph: z.number().int().min(1).optional(),
});

export type RawRateLimit = z.infer<typeof RawRateLimitSchema>;

/** Worktree isolation settings. */
export const RawWorktreeSchema = z.object({
  /** Absolute or relative path for worktree storage. If relative, resolved
   * against the config file directory. */
  path: z.string().min(1),
  /** Whether worktree isolation is enabled. */
  enabled: z.boolean().optional(),
  /** Whether to initialize git submodules in worktrees. */
  initSubmodules: z.boolean().optional(),
  /** Maximum number of parallel worktrees. */
  maxConcurrent: z.number().int().min(1).optional(),
});

export type RawWorktree = z.infer<typeof RawWorktreeSchema>;

/** Sandbox provider settings. */
export const RawSandboxSchema = z.object({
  /** Provider type: "e2b", "modal", etc. */
  provider: z.string().min(1).optional(),
  /** API key */
  apiKey: z.string().min(1).optional(),
  /** Timeout in milliseconds */
  timeout: z.number().int().min(1).optional(),
});

export type RawSandbox = z.infer<typeof RawSandboxSchema>;

/** Gateway settings (multi-agent routing). */
export const RawGatewaySchema = z.object({
  /** Whether the gateway is enabled. */
  enabled: z.boolean().optional(),
  /** Port number (1-65535) */
  port: z.number().int().min(1).max(65535).optional(),
});

export type RawGateway = z.infer<typeof RawGatewaySchema>;

/** MCP (Model Context Protocol) settings. */
export const RawMcpSchema = z.object({
  /** Whether MCP is enabled. */
  enabled: z.boolean().optional(),
  /** Timeout in milliseconds */
  timeout: z.number().int().min(1).optional(),
  /** Maximum number of retries. */
  retries: z.number().int().min(0).max(10).optional(),
  /** Timeout per tool call in milliseconds */
  toolTimeout: z.number().int().min(1).optional(),
});

export type RawMcp = z.infer<typeof RawMcpSchema>;

/** Tool registry settings. */
export const RawToolsSchema = z.object({
  /** Maximum execution timeout per tool call in milliseconds. */
  timeout: z.number().int().min(1).optional(),
  /** Maximum number of retries on failure. */
  retries: z.number().int().min(0).max(10).optional(),
});

export type RawTools = z.infer<typeof RawToolsSchema>;

/** Memory/persistence settings. */
export const RawMemorySchema = z.object({
  /** Whether memory persistence is enabled. */
  enabled: z.boolean().optional(),
  /** Vector store type: "sqlite", "duckdb", etc. */
  vectorStore: z.string().min(1).optional(),
});

export type RawMemory = z.infer<typeof RawMemorySchema>;

/** Per-task cost cap configuration. */
export const RawCostCapsSchema = z.object({
  /** Maximum cost per task run in USD */
  perTask: z.number().min(0).optional(),
  /** Maximum cost per session in USD */
  perSession: z.number().min(0).optional(),
  /** Maximum daily cost in USD */
  perDay: z.number().min(0).optional(),
});

export type RawCostCaps = z.infer<typeof RawCostCapsSchema>;

/** Session management settings. */
export const RawSessionsSchema = z.object({
  /** Session timeout in milliseconds. */
  idleTimeout: z.number().int().min(1).optional(),
  /** Maximum number of concurrent sessions. */
  maxConcurrent: z.number().int().min(1).optional(),
  /** Maximum sessions per user per day. */
  maxPerUserPerDay: z.number().int().min(1).optional(),
  /** Whether to persist sessions. */
  persist: z.boolean().optional(),
});

export type RawSessions = z.infer<typeof RawSessionsSchema>;

/** Learning / memory-augmented mode settings. */
export const RawLearningSchema = z.object({
  /** Learning mode: "disabled", "read", "write", "read-write". */
  mode: z.enum(['disabled', 'read', 'write', 'read-write']).optional(),
  /** Maximum learning iterations. */
  maxIterations: z.number().int().min(1).optional(),
  /** Maximum context windows to maintain. */
  maxContextWindows: z.number().int().min(1).optional(),
});

export type RawLearning = z.infer<typeof RawLearningSchema>;

/** Evaluation/run settings. */
export const RawEvalSchema = z.object({
  /** Maximum parallel evaluations. */
  maxConcurrent: z.number().int().min(1).optional(),
  /** Timeout in milliseconds. */
  timeout: z.number().int().min(1).optional(),
});

export type RawEval = z.infer<typeof RawEvalSchema>;

/** TUI (terminal UI) settings. */
export const RawTuiSchema = z.object({
  /** Theme name. */
  theme: z.string().min(1).optional(),
  /** Enable keyboard shortcuts. */
  keyboardShortcuts: z.boolean().optional(),
  /** Animation speed factor. */
  animationSpeed: z.number().min(0).max(5).optional(),
});

export type RawTui = z.infer<typeof RawTuiSchema>;

/** CLI defaults for mode, provider, etc. */
export const RawCliSchema = z.object({
  /** Default operating mode (ask, plan, code, debug, review). */
  mode: z.enum(['ask', 'plan', 'code', 'debug', 'review']).optional(),
  /** Default provider when none is specified. */
  defaultProvider: z.string().min(1).optional(),
});

export type RawCli = z.infer<typeof RawCliSchema>;

/** Security / access-control settings. */
export const RawSecuritySchema = z.object({
  /** Whether secret detection is enabled. */
  secretDetection: z.boolean().optional(),
  /** Rate-limit mode: "per-user", "global". */
  rateLimitMode: z.enum(['per-user', 'global']).optional(),
});

export type RawSecurity = z.infer<typeof RawSecuritySchema>;

/** OAL (autonomous loop) budget constraints. */
export const RawOalSchema = z.object({
  /** Maximum iterations per OAL run. */
  maxIterations: z.number().int().min(1).optional(),
  /** Maximum wall-clock duration in milliseconds. */
  maxDuration: z.number().int().min(1).optional(),
  /** Maximum cost per run in USD. */
  maxCost: z.number().min(0).optional(),
});

export type RawOal = z.infer<typeof RawOalSchema>;

// ---------------------------------------------------------------------------
// Top-level chimera config schema
// ---------------------------------------------------------------------------

export const chimeraConfigSchema = z.object({
  /** Version of the config format (e.g., "1.0.0"). */
  version: z.string().min(1).optional(),

  /** Default model to use when no provider/model is specified. */
  defaultModel: z.string().min(1).optional(),

  /** AI provider configuration. */
  ai: RawAiSchema.optional(),

  /** Rate limiting configuration. */
  rate_limit: RawRateLimitSchema.optional(),

  /** Worktree isolation configuration. */
  worktree: RawWorktreeSchema.optional(),

  /** Sandbox provider configuration. */
  sandbox: RawSandboxSchema.optional(),

  /** Gateway (multi-agent routing) configuration. */
  gateway: RawGatewaySchema.optional(),

  /** MCP configuration. */
  mcp: RawMcpSchema.optional(),

  /** Tool execution configuration. */
  tools: RawToolsSchema.optional(),

  /** Memory/persistence configuration. */
  memory: RawMemorySchema.optional(),

  /** Per-task cost cap configuration. */
  cost_caps: RawCostCapsSchema.optional(),

  /** Session management configuration. */
  sessions: RawSessionsSchema.optional(),

  /** Learning mode configuration. */
  learning: RawLearningSchema.optional(),

  /** Evaluation/run configuration. */
  eval: RawEvalSchema.optional(),

  /** Terminal UI configuration. */
  tui: RawTuiSchema.optional(),

  /** CLI defaults. */
  cli: RawCliSchema.optional(),

  /** Security / access-control configuration. */
  security: RawSecuritySchema.optional(),

  /** OAL autonomous-loop budget. */
  oal: RawOalSchema.optional(),

  /**
   * Global log level (debug | info | warn | error).
   * Also accepted as `log_level` (snake_case) for backward compat.
   */
  log_level: LogLevelSchema.optional(),

  /** Log level (alias for log_level). */
  logLevel: LogLevelSchema.optional(),

  /**
   * Workspace / directory paths.
   * `workspaces` is the modern key; `workspace` is the legacy alias.
   */
  workspace: z.object({
    dir: z.string().min(1).optional(),
    tempDir: z.string().min(1).optional(),
  }).optional(),

  workspaces: z.object({
    dir: z.string().min(1).optional(),
    tempDir: z.string().min(1).optional(),
  }).optional(),

  /** Path to custom instruction files (e.g., AGENTS.md). */
  instructions: z.string().min(1).optional(),

  /** Maximum number of tool calls per turn. */
  maxTurns: z.number().int().min(1).optional(),

  /** Whether worktree isolation is enabled at the global level. */
  worktreeIsolation: z.boolean().optional(),
});

export type RawChimeraConfig = z.infer<typeof chimeraConfigSchema>;

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: true;
  data: RawChimeraConfig;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type Validation = ValidationResult | ValidationFailure;

// ---------------------------------------------------------------------------
// Validation function
// ---------------------------------------------------------------------------

/**
 * Read the offending input value at `issue.path` from the original data.
 * Zod issues don't carry the input value (it lives on the error), so we
 * re-walk the path to render it in error messages.
 */
function valueAtPath(data: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value.slice(0, 50)}"`;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  return String(value);
}

/**
 * Validate raw config data against the chimera config schema.
 *
 * Returns `{ ok: true, data }` on success, or `{ ok: false, errors }` with
 * human-readable messages on failure.
 *
 * Error messages use the pattern:
 *   `"path.to.field must be <constraint>, got: <value>"`
 */
export function validateConfig(data: unknown): Validation {
  const result = chimeraConfigSchema.safeParse(data);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: string[] = [];
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '(root)';
    const value = formatValue(valueAtPath(data, issue.path));

    let message: string;
    switch (issue.code) {
      case 'too_small':
        if (issue.type === 'string') {
          message = `${path} must be a string with at least ${issue.minimum} characters, got: ${value}`;
        } else if (issue.type === 'number') {
          message = issue.inclusive
            ? `${path} must be >= ${issue.minimum}, got: ${value}`
            : `${path} must be > ${issue.minimum}, got: ${value}`;
        } else {
          message = `${path} must have at least ${issue.minimum} items, got: ${value}`;
        }
        break;
      case 'too_big':
        if (issue.type === 'string') {
          message = `${path} must be at most ${issue.maximum} characters, got: ${value}`;
        } else if (issue.type === 'number') {
          message = issue.inclusive
            ? `${path} must be <= ${issue.maximum}, got: ${value}`
            : `${path} must be < ${issue.maximum}, got: ${value}`;
        } else {
          message = `${path} must have at most ${issue.maximum} items, got: ${value}`;
        }
        break;
      case 'invalid_enum_value': {
        const options = (issue as any).options as string[];
        const list = options.length > 0 ? options.join(' | ') : (issue as any).expected;
        message = `${path} must be one of [${list}], got: ${value}`;
        break;
      }
      case 'invalid_type':
        if (issue.expected === 'integer') {
          message = `${path} must be an integer, got: ${issue.received}`;
        } else if (issue.expected === 'number') {
          message = `${path} must be a number, got: ${issue.received}`;
        } else if (issue.expected === 'string') {
          message = `${path} must be a string, got: ${issue.received}`;
        } else if (issue.expected === 'boolean') {
          message = `${path} must be a boolean, got: ${issue.received}`;
        } else if (issue.expected === 'array') {
          message = `${path} must be an array, got: ${issue.received}`;
        } else if (issue.expected === 'object') {
          message = `${path} must be an object, got: ${issue.received}`;
        } else if (typeof issue.expected === 'string' && issue.expected.includes(' | ')) {
          message = `${path} must be one of [${issue.expected}], got: ${issue.received}`;
        } else {
          message = `${path} must be a ${issue.expected}, got: ${issue.received}`;
        }
        break;
      case 'invalid_string':
        message = `${path} must be a valid URL, got: ${value}`;
        break;
      case 'invalid_union':
        message = `${path} did not match any allowed variant`;
        break;
      default:
        message = `${path}: ${issue.message}`;
        break;
    }

    errors.push(message);
  }

  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// File loader + validator
// ---------------------------------------------------------------------------

/**
 * Load a YAML config file from disk and validate it.
 *
 * If the file doesn't exist or isn't valid YAML, returns a validation
 * failure with a descriptive error.
 */
export function loadAndValidate(path: string): Validation {
  if (!existsSync(path)) {
    return {
      ok: false,
      errors: [`Config file not found: ${path}`],
    };
  }

  let raw: unknown;
  try {
    const content = readFileSync(path, 'utf-8');
    raw = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [`Failed to parse YAML at ${path}: ${msg}`],
    };
  }

  return validateConfig(raw);
}

// ---------------------------------------------------------------------------
// chimeraConfigSchema is exported above as the Zod schema object.
// ---------------------------------------------------------------------------