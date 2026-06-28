/**
 * Purpose Guard
 *
 * Every sub-agent dispatch must declare its purpose.
 * Prevents aimless spawning and enables purpose-specific policies.
 *
 * Modeled after Omnigent's headless_subagent_purpose_guard policy.
 */
/**
 * Allowed purposes for sub-agent dispatch.
 */
export type SubAgentPurpose = 'implement' | 'review' | 'explore' | 'search' | 'test' | 'debug' | 'refactor' | 'document' | 'plan';
export declare const ALLOWED_PURPOSES: Set<SubAgentPurpose>;
export interface PurposeGuardResult {
    valid: boolean;
    purpose: SubAgentPurpose | null;
    reason?: string;
}
/**
 * Validate that a purpose is allowed.
 */
export declare function validatePurpose(purpose: string): PurposeGuardResult;
/**
 * Get the allowed tools for a given purpose.
 * More restrictive purposes get fewer tools.
 */
export declare function getAllowedToolsForPurpose(purpose: SubAgentPurpose): {
    allowed: string[];
    denied: string[];
};
/**
 * Get the recommended model tier for a given purpose.
 */
export declare function getRecommendedTierForPurpose(purpose: SubAgentPurpose): 'cheap' | 'mid' | 'frontier';
//# sourceMappingURL=purpose-guard.d.ts.map