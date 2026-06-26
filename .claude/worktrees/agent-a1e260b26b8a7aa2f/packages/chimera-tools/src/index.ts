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

// Tool builder
export { TOOL_DEFAULTS, buildTool, type ToolDefinitionInput } from './tool-builder.js';

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
export { applyPatchTool, editBlockTool, searchReplaceTool } from './tools/edit.js';

// Web tools
export { webFetchTool, webSearchTool } from './tools/web.js';

// Todo tools
export { todoWriteTool, todoReadTool, questionTool } from './tools/todo.js';

// Task tools
export { taskCreateTool, taskListTool, taskUpdateTool, TaskSchema, TaskStatusSchema } from './tools/task.js';
export type { Task, TaskStatus } from './tools/task.js';

// Skill tool
export { skillLoadTool } from './tools/skill.js';

// LSP tools
export { lspTool } from './tools/lsp.js';

// MCP client
export { McpClient, McpManager } from './mcp-client.js';
export type { McpServerConfig } from './mcp-client.js';

// All tools array for bulk registration
import { readFileTool, writeFileTool, listDirectoryTool } from './tools/filesystem.js';
import { searchFilesTool, globFilesTool } from './tools/search.js';
import { runShellCommandTool } from './tools/shell.js';
import { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool } from './tools/git.js';
import { applyPatchTool, editBlockTool, searchReplaceTool } from './tools/edit.js';
import { webFetchTool, webSearchTool } from './tools/web.js';
import { todoWriteTool, todoReadTool, questionTool } from './tools/todo.js';
import { taskCreateTool, taskListTool, taskUpdateTool } from './tools/task.js';
import { skillLoadTool } from './tools/skill.js';

export const allTools = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  searchFilesTool,
  globFilesTool,
  runShellCommandTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
  applyPatchTool,
  editBlockTool,
  searchReplaceTool,
  webFetchTool,
  webSearchTool,
  todoWriteTool,
  todoReadTool,
  questionTool,
  taskCreateTool,
  taskListTool,
  taskUpdateTool,
  skillLoadTool,
] as const;

// Permission engine
export { PermissionEngine, type PermissionProfile } from './permission/policy.js';
export { CommandPolicy } from './permission/command-policy.js';
export { PathRestrictionEngine } from './permission/path-restrictions.js';

// Sandbox
export { Sandbox } from './sandbox/sandbox.js';
export { PTYExecutor } from './sandbox/pty-executor.js';
export { EnvironmentFilter } from './sandbox/env-filter.js';
export { SecretDetector } from './sandbox/secret-detector.js';
