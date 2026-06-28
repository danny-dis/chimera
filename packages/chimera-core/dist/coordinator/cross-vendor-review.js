"use strict";
/**
 * Cross-Vendor Review Enforcer
 *
 * Ensures the reviewer is a different vendor than the implementer.
 * This is the single most powerful pattern for catching blind spots.
 *
 * Modeled after Omnigent's Polly orchestrator pattern where every PR
 * is reviewed by a DIFFERENT vendor than the implementer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractVendor = extractVendor;
exports.areSameVendor = areSameVendor;
exports.findCrossVendorReviewer = findCrossVendorReviewer;
exports.assignCrossVendorProviders = assignCrossVendorProviders;
exports.validateCrossVendorReview = validateCrossVendorReview;
/**
 * Extract the vendor/provider from a model name.
 * e.g., "claude-sonnet-4-20250514" → "anthropic"
 *       "gpt-4o" → "openai"
 *       "deepseek-chat" → "deepseek"
 *       "qwen-2.5" → "qwen"
 */
function extractVendor(model) {
    const lower = model.toLowerCase();
    if (lower.includes('claude') || lower.includes('anthropic'))
        return 'anthropic';
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('openai'))
        return 'openai';
    if (lower.includes('deepseek'))
        return 'deepseek';
    if (lower.includes('qwen') || lower.includes('kimi'))
        return 'alibaba';
    if (lower.includes('gemini') || lower.includes('google'))
        return 'google';
    if (lower.includes('llama') || lower.includes('codellama'))
        return 'meta';
    if (lower.includes('mistral') || lower.includes('mixtral'))
        return 'mistral';
    if (lower.includes('phi'))
        return 'microsoft';
    if (lower.includes('grok'))
        return 'xai';
    // Default: use the model name as vendor
    return lower.split(/[-_]/)[0] ?? 'unknown';
}
/**
 * Check if two agents are from the same vendor.
 */
function areSameVendor(agentA, agentB) {
    return extractVendor(agentA.model) === extractVendor(agentB.model);
}
/**
 * Find a reviewer from a different vendor than the implementer.
 * Returns null if no cross-vendor reviewer is available.
 */
function findCrossVendorReviewer(implementer, availableReviewers) {
    const implementerVendor = extractVendor(implementer.model);
    // Prefer reviewers from different vendors
    const crossVendor = availableReviewers.filter((r) => extractVendor(r.model) !== implementerVendor);
    if (crossVendor.length > 0) {
        // Prefer frontier models for review
        return crossVendor.sort((a, b) => {
            const aTier = getModelTier(a.model);
            const bTier = getModelTier(b.model);
            return bTier - aTier;
        })[0];
    }
    return null;
}
/**
 * Assign providers for cross-vendor review.
 * Returns a mapping of agent roles to their assigned providers.
 */
function assignCrossVendorProviders(providers, roles) {
    const assignment = new Map();
    const usedVendors = new Set();
    // Sort roles by importance (reviewer first, then writer, then others)
    const rolePriority = ['reviewer', 'challenger', 'writer', 'synthesizer'];
    const sortedRoles = roles.sort((a, b) => {
        return rolePriority.indexOf(a) - rolePriority.indexOf(b);
    });
    for (const role of sortedRoles) {
        const candidates = providers.filter((p) => p.role === role);
        if (candidates.length === 0)
            continue;
        // Prefer vendors not yet used
        const freshVendor = candidates.find((c) => !usedVendors.has(extractVendor(c.model)));
        if (freshVendor) {
            assignment.set(role, freshVendor);
            usedVendors.add(extractVendor(freshVendor.model));
        }
        else {
            // Fall back to any available provider for this role
            assignment.set(role, candidates[0]);
        }
    }
    return assignment;
}
/**
 * Get model tier (higher = more capable).
 */
function getModelTier(model) {
    const lower = model.toLowerCase();
    // Frontier tier
    if (lower.includes('opus') || lower.includes('o3') || lower.includes('r1'))
        return 4;
    // High tier
    if (lower.includes('sonnet') || lower.includes('gpt-4o') || lower.includes('deepseek-v3') || lower.includes('kimi'))
        return 3;
    // Mid tier
    if (lower.includes('haiku') || lower.includes('gpt-4o-mini') || lower.includes('flash'))
        return 2;
    // Low tier
    return 1;
}
/**
 * Validate that a review assignment is cross-vendor.
 * Returns warnings if the reviewer is from the same vendor.
 */
function validateCrossVendorReview(implementer, reviewer) {
    const warnings = [];
    if (areSameVendor(implementer, reviewer)) {
        const vendor = extractVendor(implementer.model);
        warnings.push(`Reviewer (${reviewer.model}) is from the same vendor (${vendor}) as implementer (${implementer.model}). ` +
            `Cross-vendor review is recommended for catching blind spots.`);
    }
    const implementerTier = getModelTier(implementer.model);
    const reviewerTier = getModelTier(reviewer.model);
    if (reviewerTier < implementerTier) {
        warnings.push(`Reviewer (${reviewer.model}, tier ${reviewerTier}) is less capable than implementer (${implementer.model}, tier ${implementerTier}). ` +
            `Consider using a more capable model for review.`);
    }
    return {
        valid: warnings.length === 0,
        warnings,
    };
}
//# sourceMappingURL=cross-vendor-review.js.map