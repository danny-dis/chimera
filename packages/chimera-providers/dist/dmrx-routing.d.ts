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
export declare const DMRX_PRESETS: readonly ["auto", "auto-fast", "auto-smart", "auto-agentic", "auto-coding"];
export type DmrxPreset = (typeof DMRX_PRESETS)[number];
/** Chimera's operational modes (see chimera-core AgentRole/Mode). */
export type ChimeraMode = 'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal' | 'auto';
/**
 * Map a role to its optimized DMR-X meta-model.
 *   planner/plan  → auto-smart   (strongest reasoning)
 *   writer/code   → auto-coding  (best codegen)
 *   reviewer      → auto-fast    (fast verification pass)
 *   challenger    → auto-agentic (tool-capable, 64K+ ctx for independent view)
 *   everything else (synthesizer/summarizer/researcher) → auto
 */
export declare const ROLE_TO_DMRX_PRESET: Record<string, DmrxPreset>;
export declare function isDmrxBackend(backend: unknown): backend is 'dmrx';
export declare function isDmrxPreset(model: string): boolean;
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
export declare function applyDmrxRouting<T extends {
    providers: Array<{
        role?: string;
        model: string;
    }>;
}>(config: T, backend: unknown, mode?: string): T;
//# sourceMappingURL=dmrx-routing.d.ts.map