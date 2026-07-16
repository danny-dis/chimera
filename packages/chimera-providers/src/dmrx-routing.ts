/**
 * DMR-X backend routing — auto-map each Chimera agent role to the DMR-X
 * meta-model that optimizes it.
 *
 * DMR-X (github.com/dmr-x/dmr-x) exposes dynamic routing meta-models as plain
 * model names on its OpenAI-compatible /v1/chat/completions endpoint:
 *   auto, auto-fast, auto-smart, auto-agentic, auto-coding
 * Chimera's model resolver already passes any literal model string straight
 * through to the SDK, so `model: "auto-coding"` reaches DMR-X unchanged. The
 * only work here is choosing the RIGHT meta-model per role/mode.
 *
 * Activated by `backend: dmrx` in .chimera/config.yaml (the provider entries
 * must already point at the DMR-X gateway — provider openai-compatible +
 * base_url http://127.0.0.1:3000/v1). When backend is not "dmrx" this module
 * is a no-op so direct-provider behavior is untouched.
 */

/** DMR-X dynamic-routing meta-models (verbatim from DMR-X README). */
export const DMRX_PRESETS = [
  'auto',
  'auto-fast',
  'auto-smart',
  'auto-agentic',
  'auto-coding',
] as const;
export type DmrxPreset = (typeof DMRX_PRESETS)[number];

/** Chimera's operational modes (see chimera-core AgentRole/Mode). */
export type ChimeraMode =
  | 'ask'
  | 'plan'
  | 'code'
  | 'debug'
  | 'review'
  | 'oal'
  | 'auto';

/**
 * Map a role to its optimized DMR-X meta-model.
 *   planner/plan  → auto-smart   (strongest reasoning)
 *   writer/code   → auto-coding  (best codegen)
 *   reviewer      → auto-fast    (fast verification pass)
 *   challenger    → auto-agentic (tool-capable, 64K+ ctx for independent view)
 *   everything else (synthesizer/summarizer/researcher) → auto
 */
export const ROLE_TO_DMRX_PRESET: Record<string, DmrxPreset> = {
  planner: 'auto-smart',
  plan: 'auto-smart',
  writer: 'auto-coding',
  code: 'auto-coding',
  reviewer: 'auto-fast',
  challenger: 'auto-agentic',
  duo: 'auto-agentic',
  trio: 'auto-agentic',
  synthesizer: 'auto',
  summarizer: 'auto',
  researcher: 'auto',
};

/** Mode-level override — when a whole run is in one mode, bias every role. */
const MODE_TO_DMRX_PRESET: Partial<Record<ChimeraMode, DmrxPreset>> = {
  ask: 'auto',
  plan: 'auto-smart',
  code: 'auto-coding',
  debug: 'auto',
  review: 'auto-fast',
  oal: 'auto',
  auto: 'auto',
};

export function isDmrxBackend(backend: unknown): backend is 'dmrx' {
  return backend === 'dmrx';
}

export function isDmrxPreset(model: string): boolean {
  return (DMRX_PRESETS as readonly string[]).includes(model);
}

/**
 * Rewrite each provider's model to its DMR-X meta-model. Pure: returns a new
 * config, never mutates the input. No-op unless `backend === 'dmrx'`.
 *
 * @param config  Parsed .chimera/config.yaml
 * @param backend The config's `backend` field (undefined = direct mode)
 * @param mode    Optional operational mode; when set, biases ALL roles to the
 *                mode's preset (still role-refined below for writer/reviewer/
 *                challenger so review stays fast inside a code run, etc.)
 */
export function applyDmrxRouting<T extends { providers: Array<{ role?: string; model: string }> }>(
  config: T,
  backend: unknown,
  mode?: string,
): T {
  if (!isDmrxBackend(backend)) return config;

  const modePreset = mode ? MODE_TO_DMRX_PRESET[mode as ChimeraMode] : undefined;

  const providers = config.providers.map((p) => {
    const rolePreset = p.role ? ROLE_TO_DMRX_PRESET[p.role] : undefined;
    // Mode bias wins for non-core roles; core roles keep their tuned preset.
    const preset =
      rolePreset && (p.role === 'writer' || p.role === 'reviewer' || p.role === 'challenger')
        ? rolePreset
        : (modePreset ?? rolePreset ?? 'auto');
    return { ...p, model: preset };
  });

  return { ...config, providers };
}
