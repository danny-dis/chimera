export { WorktreeProvider, } from './providers/worktree.js';
export { slugify, shortHash, resolveRepoLocalOverride, } from './providers/worktree-helpers.js';
export { copyWorktreeFiles, } from './worktree-copy.js';
export { classifyIsolationError, IsolationBlockedError, } from './errors.js';
export { cleanupStaleWorktrees, removeWorktree, } from './cleanup.js';
export { E2BProvider } from './providers/e2b.js';
export type { E2BConfig } from './providers/e2b.js';
export { ModalProvider } from './providers/modal.js';
export type { ModalConfig } from './providers/modal.js';
export { SandboxRegistry, createDefaultSandboxRegistry } from './sandbox-registry.js';
export type { SandboxProviderRegistration } from './sandbox-registry.js';
export type { IsolationProviderType, IsolationWorkflowType, EnvironmentStatus, TaskIsolationRequest, IsolationRequest, IsolatedEnvironment, WorktreeEnvironment, WorktreeMetadata, DestroyOptions, WorktreeDestroyOptions, DestroyResult, IIsolationProvider, IsolationHints, IsolationBlockReason, WorktreeCreateConfig, RepoConfigLoader, } from './types.js';
export type { RepoPath, BranchName, WorktreePath, } from './types/branded.js';
//# sourceMappingURL=index.d.ts.map