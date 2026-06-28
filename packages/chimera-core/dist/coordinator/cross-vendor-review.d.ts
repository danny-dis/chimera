/**
 * Cross-Vendor Review Enforcer
 *
 * Ensures the reviewer is a different vendor than the implementer.
 * This is the single most powerful pattern for catching blind spots.
 *
 * Modeled after Omnigent's Polly orchestrator pattern where every PR
 * is reviewed by a DIFFERENT vendor than the implementer.
 */
import type { AgentConfig, AgentRole } from '../types/agent.js';
/**
 * Extract the vendor/provider from a model name.
 * e.g., "claude-sonnet-4-20250514" → "anthropic"
 *       "gpt-4o" → "openai"
 *       "deepseek-chat" → "deepseek"
 *       "qwen-2.5" → "qwen"
 */
export declare function extractVendor(model: string): string;
/**
 * Check if two agents are from the same vendor.
 */
export declare function areSameVendor(agentA: AgentConfig, agentB: AgentConfig): boolean;
/**
 * Find a reviewer from a different vendor than the implementer.
 * Returns null if no cross-vendor reviewer is available.
 */
export declare function findCrossVendorReviewer(implementer: AgentConfig, availableReviewers: AgentConfig[]): AgentConfig | null;
/**
 * Assign providers for cross-vendor review.
 * Returns a mapping of agent roles to their assigned providers.
 */
export declare function assignCrossVendorProviders(providers: AgentConfig[], roles: AgentRole[]): Map<AgentRole, AgentConfig>;
/**
 * Validate that a review assignment is cross-vendor.
 * Returns warnings if the reviewer is from the same vendor.
 */
export declare function validateCrossVendorReview(implementer: AgentConfig, reviewer: AgentConfig): {
    valid: boolean;
    warnings: string[];
};
//# sourceMappingURL=cross-vendor-review.d.ts.map