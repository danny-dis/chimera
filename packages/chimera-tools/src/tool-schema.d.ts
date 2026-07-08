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
    isEnabled?: (params: z.infer<P>, context: ToolContext) => boolean;
    isConcurrencySafe?: () => boolean;
    isReadOnly?: (params: z.infer<P>, context: ToolContext) => boolean;
    isDestructive?: (params: z.infer<P>, context: ToolContext) => boolean;
    preExecution?: (params: z.infer<P>, context: ToolContext) => Promise<z.infer<P>>;
    postExecution?: (result: z.infer<R>, params: z.infer<P>, context: ToolContext) => Promise<z.infer<R>>;
    onError?: (error: Error, params: z.infer<P>, context: ToolContext) => Promise<void>;
    timeout?: number;
    maxRetries?: number;
    retryableErrors?: string[];
}
export declare const PathSchema: z.ZodString;
export declare const FileEntrySchema: z.ZodObject<{
    name: z.ZodString;
    path: z.ZodString;
    type: z.ZodEnum<["file", "directory", "symlink"]>;
    size: z.ZodOptional<z.ZodNumber>;
    modified: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    path: string;
    type: "file" | "directory" | "symlink";
    modified?: string | undefined;
    size?: number | undefined;
}, {
    name: string;
    path: string;
    type: "file" | "directory" | "symlink";
    modified?: string | undefined;
    size?: number | undefined;
}>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export declare const SearchMatchSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
    match: z.ZodString;
    context: z.ZodOptional<z.ZodObject<{
        before: z.ZodString;
        after: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        before: string;
        after: string;
    }, {
        before: string;
        after: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    match: string;
    line: number;
    file: string;
    column: number;
    context?: {
        before: string;
        after: string;
    } | undefined;
}, {
    match: string;
    line: number;
    file: string;
    column: number;
    context?: {
        before: string;
        after: string;
    } | undefined;
}>;
export type SearchMatch = z.infer<typeof SearchMatchSchema>;
export declare const GitFileStatusSchema: z.ZodObject<{
    path: z.ZodString;
    status: z.ZodString;
    staged: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    status: string;
    staged?: boolean | undefined;
}, {
    path: string;
    status: string;
    staged?: boolean | undefined;
}>;
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;
export declare const GitCommitSchema: z.ZodObject<{
    hash: z.ZodString;
    shortHash: z.ZodString;
    author: z.ZodString;
    date: z.ZodString;
    message: z.ZodString;
    files: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    message: string;
    files: string[];
    date: string;
    hash: string;
    shortHash: string;
    author: string;
}, {
    message: string;
    files: string[];
    date: string;
    hash: string;
    shortHash: string;
    author: string;
}>;
export type GitCommit = z.infer<typeof GitCommitSchema>;
export declare const MAX_FILE_SIZE: number;
export declare const MAX_OUTPUT_SIZE: number;
export declare const DEFAULT_SHELL_TIMEOUT = 30000;
export declare const MAX_SHELL_TIMEOUT = 300000;
export declare const IGNORED_DIRS: string[];
//# sourceMappingURL=tool-schema.d.ts.map