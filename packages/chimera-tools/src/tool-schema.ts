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
  /**
   * Optional AbortSignal forwarded by the orchestrator from its
   * execute()-scoped AbortController. Tools that perform long-running
   * work (shell, network, etc.) may wire this through to underlying
   * APIs that support cancellation. Tools that ignore the field
   * remain correct — the signal is advisory.
   */
  signal?: AbortSignal;
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

  // Metadata — optional, filled by buildTool() defaults
  isEnabled?: (params: z.infer<P>, context: ToolContext) => boolean;
  isConcurrencySafe?: () => boolean;
  isReadOnly?: (params: z.infer<P>, context: ToolContext) => boolean;
  isDestructive?: (params: z.infer<P>, context: ToolContext) => boolean;

  // Streaming executor hooks
  preExecution?: (params: z.infer<P>, context: ToolContext) => Promise<z.infer<P>>;
  postExecution?: (result: z.infer<R>, params: z.infer<P>, context: ToolContext) => Promise<z.infer<R>>;
  onError?: (error: Error, params: z.infer<P>, context: ToolContext) => Promise<void>;
  timeout?: number;
  maxRetries?: number;
  retryableErrors?: string[];
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

/**
 * Convert a Zod schema into an OpenAI-style JSON schema object the model
 * API can consume. Zod schemas have no built-in `.toJSON()`, so the previous
 * `t.parameters?.toJSON?.() ?? {}` produced an empty `parameters: {}` — which
 * silently broke tool calling (the model narrated tool names instead of
 * emitting structured tool_calls). This handles the shapes Chimera's tools
 * actually use: object, string, number, boolean, array, enum, optional,
 * nullable, and `.default()`.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def: any = (schema as any)._def ?? {};
  const type = def.typeName as string | undefined;

  switch (type) {
    case 'ZodObject': {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(val as z.ZodType);
        const v = val as any;
        const isOptional =
          v._def?.typeName === 'ZodOptional' ||
          v._def?.typeName === 'ZodNullable' ||
          v._def?.typeName === 'ZodDefault';
        if (!isOptional) required.push(key);
      }
      return { type: 'object', properties, ...(required.length ? { required } : {}) };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.type().element) };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodOptional':
    case 'ZodNullable':
      return zodToJsonSchema(def.innerType());
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType());
    default:
      return { type: 'string' };
  }
}
