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
import type { ToolDefinition } from './tool-schema.js';

// Tool builder
export { TOOL_DEFAULTS, buildTool, type ToolDefinitionInput } from './tool-builder.js';

// Registry
export { ToolRegistry } from './tool-registry.js';

// Executor
export { ToolExecutor, type PermissionChecker } from './tool-executor.js';

// Filesystem tools
export { readFileTool, writeFileTool, listDirectoryTool } from './tools/filesystem.js';
export { type MediaBlock, MediaBlockSchema } from './tools/media-types.js';

// Search tools
export { searchFilesTool, globFilesTool } from './tools/search.js';
export { findFolderTool } from './tools/find-folder.js';

// Shell tools
export { runShellCommandTool } from './tools/shell.js';

// Git tools
export { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool, gitInitTool, gitAddTool, gitCommitTool, gitPushTool } from './tools/git.js';

// Edit tools
export { applyPatchTool, editBlockTool, editFileTool, searchReplaceTool } from './tools/edit.js';

// Web tools
export { webFetchTool, webSearchTool } from './tools/web.js';

// Todo tools
export { todoWriteTool, todoReadTool, questionTool } from './tools/todo.js';

// Task tools
export { taskCreateTool, taskListTool, taskUpdateTool, TaskSchema, TaskStatusSchema } from './tools/task.js';
export type { Task, TaskStatus } from './tools/task.js';

// Skill tools
export { skillLoadTool, createSkillTool, createWorkflowTool } from './tools/skill.js';

// LSP tools
export { lspTool } from './tools/lsp.js';
export { getDiagnosticsForFile, formatDiagnostics, type LspDiagnosticIssue } from './lsp-diagnostics.js';

// MCP client
export { McpClient, McpManager } from './mcp-client.js';
export type { McpServerConfig } from './mcp-client.js';

// MCP tool integration
import { initializeMcpTools } from './mcp-tools.js';
export { initializeMcpTools };
export type { McpConfigFile } from './mcp-client.js';

// All tools array for bulk registration
import { readFileTool, writeFileTool, listDirectoryTool } from './tools/filesystem.js';
import { searchFilesTool, globFilesTool } from './tools/search.js';
import { findFolderTool } from './tools/find-folder.js';
import { runShellCommandTool } from './tools/shell.js';
import { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool, gitInitTool, gitAddTool, gitCommitTool, gitPushTool } from './tools/git.js';
import { applyPatchTool, editBlockTool, editFileTool, searchReplaceTool } from './tools/edit.js';
import { webFetchTool, webSearchTool } from './tools/web.js';
import { todoWriteTool, todoReadTool, questionTool } from './tools/todo.js';
import { taskCreateTool, taskListTool, taskUpdateTool } from './tools/task.js';
import { skillLoadTool, createSkillTool, createWorkflowTool } from './tools/skill.js';
import { lspTool } from './tools/lsp.js';

export const allTools = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  searchFilesTool,
  globFilesTool,
  findFolderTool,
  runShellCommandTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
  gitInitTool,
  gitAddTool,
  gitCommitTool,
  gitPushTool,
  applyPatchTool,
  editBlockTool,
  editFileTool,
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
  createSkillTool,
  createWorkflowTool,
  lspTool,
] as const;

/**
 * Builtin tools plus any tools contributed by configured MCP servers.
 * The static `allTools` above is preserved for synchronous importers
 * (e.g. the CLI registry loop); this async path is the MCP-aware one
 * the CLI should call at startup.
 */
export async function loadAllTools(workspaceRoot?: string): Promise<ToolDefinition[]> {
  const mcpTools = workspaceRoot ? await initializeMcpTools(workspaceRoot) : [];
  return [...allTools, ...mcpTools];
}

// Permission engine
export { PermissionEngine, readOnlyProfile, editFilesProfile, fullAccessProfile, type PermissionProfile, type PermissionMode, type PermissionRule, type PermissionCondition } from './permission/policy.js';
export { CommandPolicy } from './permission/command-policy.js';
export { PathRestrictionEngine } from './permission/path-restrictions.js';

// Policy stack — three-level governance (Omnigent pattern)
export { PolicyStack, createPolicyStackFromConfig } from './permission/policy-stack.js';
export type { PolicyLevel } from './permission/policy-stack.js';

// Builtin policies
export {
  askOnOsTools,
  readOnlyPolicy,
  workspaceWritePolicy,
  trustedProjectPolicy,
  costBudgetPolicy,
  maxToolCallsPolicy,
  destructiveCommandsPolicy,
  networkPolicy,
  getBuiltinPolicyNames,
  createBuiltinPolicy,
} from './permission/builtins.js';

// Sandbox
export { Sandbox } from './sandbox/sandbox.js';
export { PTYExecutor } from './sandbox/pty-executor.js';
export { EnvironmentFilter } from './sandbox/env-filter.js';
export { SecretDetector } from './sandbox/secret-detector.js';
