// @chimera/tools — Tool registry and core tools

// Schema and types
export {
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
  type ValidationResult,
  type PermissionDecision,
  type ToolCategory,
  type PermissionLevel,
  type FileEntry,
  type SearchMatch,
  type GitFileStatus,
  type GitCommit,
  PathSchema,
  FileEntrySchema,
  SearchMatchSchema,
  GitFileStatusSchema,
  GitCommitSchema,
  MAX_FILE_SIZE,
  MAX_OUTPUT_SIZE,
  DEFAULT_SHELL_TIMEOUT,
  MAX_SHELL_TIMEOUT,
  IGNORED_DIRS,
} from './tool-schema.js';

// Registry
export { ToolRegistry } from './tool-registry.js';

// Executor
export { ToolExecutor, type PermissionChecker } from './tool-executor.js';

// Filesystem tools
export { readFileTool, writeFileTool, listDirectoryTool } from './tools/filesystem.js';

// Search tools
export { searchFilesTool, globFilesTool } from './tools/search.js';

// Shell tools
export { runShellCommandTool } from './tools/shell.js';

// Git tools
export { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool } from './tools/git.js';

// Edit tools
export { applyPatchTool, editBlockTool } from './tools/edit.js';
