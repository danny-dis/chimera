/**
 * Model capability inference — derives `tier` and `specialties` from
 * model name patterns so callers don't need to configure them manually.
 *
 * The pattern list is intentionally short and high-signal. Unknown
 * models fall back to `mid` / `general` (safe default).
 */
import type { ModelCapability } from './types.js';
/**
 * Infer model capabilities from the model ID string.
 *
 * ```ts
 * inferCapabilities('gpt-4o')        → { tier: 'frontier', specialties: ['reasoning', ...] }
 * inferCapabilities('gemini-2.5-flash') → { tier: 'mid', specialties: ['general', ...] }
 * inferCapabilities('unknown-model')  → { tier: 'mid', specialties: ['general'] }
 * ```
 */
export declare function inferCapabilities(modelId: string): ModelCapability;
/**
 * Build a `ModelPool` from a list of model IDs by inferring each one's
 * capabilities. Convenience for callers that have model IDs but no
 * capability metadata.
 */
export declare function buildPool(modelIds: string[], opts?: {
    preferFrontierForJudge?: boolean;
}): import('./types.js').ModelPool;
//# sourceMappingURL=model-capabilities.d.ts.map