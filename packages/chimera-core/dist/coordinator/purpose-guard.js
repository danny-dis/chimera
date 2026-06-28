"use strict";
/**
 * Purpose Guard
 *
 * Every sub-agent dispatch must declare its purpose.
 * Prevents aimless spawning and enables purpose-specific policies.
 *
 * Modeled after Omnigent's headless_subagent_purpose_guard policy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_PURPOSES = void 0;
exports.validatePurpose = validatePurpose;
exports.getAllowedToolsForPurpose = getAllowedToolsForPurpose;
exports.getRecommendedTierForPurpose = getRecommendedTierForPurpose;
exports.ALLOWED_PURPOSES = new Set([
    'implement',
    'review',
    'explore',
    'search',
    'test',
    'debug',
    'refactor',
    'document',
    'plan',
]);
/**
 * Validate that a purpose is allowed.
 */
function validatePurpose(purpose) {
    if (!purpose) {
        return {
            valid: false,
            purpose: null,
            reason: 'Purpose is required but was not provided',
        };
    }
    const normalized = purpose.toLowerCase().trim();
    if (!exports.ALLOWED_PURPOSES.has(normalized)) {
        return {
            valid: false,
            purpose: null,
            reason: `Invalid purpose '${purpose}'. Allowed: ${[...exports.ALLOWED_PURPOSES].join(', ')}`,
        };
    }
    return {
        valid: true,
        purpose: normalized,
    };
}
/**
 * Get the allowed tools for a given purpose.
 * More restrictive purposes get fewer tools.
 */
function getAllowedToolsForPurpose(purpose) {
    switch (purpose) {
        case 'explore':
        case 'search':
            return {
                allowed: ['read_file', 'search_files', 'glob_files', 'git_status', 'git_log', 'git_diff'],
                denied: ['write_file', 'edit_file', 'shell_*'],
            };
        case 'review':
            return {
                allowed: ['read_file', 'search_files', 'glob_files', 'git_status', 'git_log', 'git_diff', 'shell_*'],
                denied: ['write_file', 'edit_file'],
            };
        case 'test':
            return {
                allowed: ['read_file', 'search_files', 'glob_files', 'shell_*', 'git_*'],
                denied: ['write_file', 'edit_file'],
            };
        case 'debug':
            return {
                allowed: ['read_file', 'search_files', 'glob_files', 'shell_*', 'git_*'],
                denied: ['write_file', 'edit_file'],
            };
        case 'implement':
        case 'refactor':
            return {
                allowed: ['read_file', 'write_file', 'edit_file', 'search_files', 'glob_files', 'shell_*', 'git_*'],
                denied: [],
            };
        case 'document':
            return {
                allowed: ['read_file', 'write_file', 'edit_file', 'search_files', 'glob_files', 'git_*'],
                denied: ['shell_*'],
            };
        case 'plan':
            return {
                allowed: ['read_file', 'search_files', 'glob_files', 'git_status', 'git_log', 'git_diff'],
                denied: ['write_file', 'edit_file', 'shell_*'],
            };
        default:
            return {
                allowed: [],
                denied: ['*'],
            };
    }
}
/**
 * Get the recommended model tier for a given purpose.
 */
function getRecommendedTierForPurpose(purpose) {
    switch (purpose) {
        case 'explore':
        case 'search':
        case 'document':
            return 'cheap';
        case 'implement':
        case 'refactor':
        case 'test':
        case 'debug':
            return 'mid';
        case 'review':
        case 'plan':
            return 'frontier';
        default:
            return 'mid';
    }
}
//# sourceMappingURL=purpose-guard.js.map