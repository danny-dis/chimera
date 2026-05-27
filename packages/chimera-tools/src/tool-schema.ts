import { z } from 'zod';
import type { EventStream, CostTracker, PermissionDecision } from '@chimera/core';

export type { PermissionDecision } from '@chimera/core';

export type ToolCategory = 'filesystem' | 'shell' | 'git' | 'search' | 'edit' | 'lsp' | 'mcp';
export type PermissionLevel = 'read' | 'write' | 'execute' | 'dangerous';

export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  eventStream: EventStream;
  costTracker: CostTracker;
  permissionCheck: (tool: string, params: Record<string, unknown>) => PermissionDecision;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  duration: number;
  truncated?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ToolDefinition<P extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: P;
  returns: R;
  category: ToolCategory;
  permissionLevel: PermissionLevel;
  execute: (params: z.infer<P>, context: ToolContext) => Promise<z.infer<R>>;
}

// Shared schemas

export const PathSchema = z.string().min(1, 'Path must not be empty');

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'symlink']),
  size: z.number().optional(),
  modified: z.string().optional(),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

export const SearchMatchSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  match: z.string(),
  context: z.object({
    before: z.string(),
    after: z.string(),
  }).optional(),
});

export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const GitFileStatusSchema = z.object({
  path: z.string(),
  status: z.string(),
  staged: z.boolean().optional(),
});

export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

export const GitCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  date: z.string(),
  message: z.string(),
  files: z.array(z.string()),
});

export type GitCommit = z.infer<typeof GitCommitSchema>;

// Constants
export const MAX_FILE_SIZE = 100 * 1024; // 100KB
export const MAX_OUTPUT_SIZE = 50 * 1024; // 50KB
export const DEFAULT_SHELL_TIMEOUT = 30_000; // 30s
export const MAX_SHELL_TIMEOUT = 300_000; // 300s

export const IGNORED_DIRS = ['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage'];
