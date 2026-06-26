// @chimera/isolation — Worktree-based isolation for parallel agent runs.
// Public API is exported below; implementation files live in providers/.

export {
  WorktreeProvider,
} from './providers/worktree.js';

export {
  slugify,
  shortHash,
  resolveRepoLocalOverride,
} from './providers/worktree-helpers.js';

export {
  copyWorktreeFiles,
} from './worktree-copy.js';

export {
  classifyIsolationError,
  IsolationBlockedError,
} from './errors.js';

export {
  cleanupStaleWorktrees,
  removeWorktree,
} from './cleanup.js';

// Public types
export type {
  IsolationProviderType,
  IsolationWorkflowType,
  EnvironmentStatus,
  TaskIsolationRequest,
  IsolationRequest,
  IsolatedEnvironment,
  WorktreeEnvironment,
  WorktreeMetadata,
  DestroyOptions,
  WorktreeDestroyOptions,
  DestroyResult,
  IIsolationProvider,
  IsolationHints,
  IsolationBlockReason,
  WorktreeCreateConfig,
  RepoConfigLoader,
} from './types.js';

export type {
  RepoPath,
  BranchName,
  WorktreePath,
} from './types/branded.js';
