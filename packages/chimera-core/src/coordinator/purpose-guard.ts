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
export type SubAgentPurpose =
  | 'implement'    // Write/modify code
  | 'review'       // Review code for correctness/security
  | 'explore'      // Explore codebase, understand architecture
  | 'search'       // Search for information, patterns, references
  | 'test'         // Write/run tests
  | 'debug'        // Debug an issue
  | 'refactor'     // Restructure existing code
  | 'document'     // Write documentation
  | 'plan';        // Plan future work

export const ALLOWED_PURPOSES: Set<SubAgentPurpose> = new Set([
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

export interface PurposeGuardResult {
  valid: boolean;
  purpose: SubAgentPurpose | null;
  reason?: string;
}

/**
 * Validate that a purpose is allowed.
 */
export function validatePurpose(purpose: string): PurposeGuardResult {
  if (!purpose) {
    return {
      valid: false,
      purpose: null,
      reason: 'Purpose is required but was not provided',
    };
  }

  const normalized = purpose.toLowerCase().trim() as SubAgentPurpose;

  if (!ALLOWED_PURPOSES.has(normalized)) {
    return {
      valid: false,
      purpose: null,
      reason: `Invalid purpose '${purpose}'. Allowed: ${[...ALLOWED_PURPOSES].join(', ')}`,
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
export function getAllowedToolsForPurpose(purpose: SubAgentPurpose): {
  allowed: string[];
  denied: string[];
} {
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
export function getRecommendedTierForPurpose(purpose: SubAgentPurpose): 'cheap' | 'mid' | 'frontier' {
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
