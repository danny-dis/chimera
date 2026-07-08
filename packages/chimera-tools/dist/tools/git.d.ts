import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const GitStatusParamsSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path?: string;
}, {
    path?: string;
}>;
declare const GitStatusReturnsSchema: z.ZodObject<{
    branch: z.ZodString;
    ahead: z.ZodNumber;
    behind: z.ZodNumber;
    staged: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodString;
        staged: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        path?: string;
        status?: string;
        staged?: boolean;
    }, {
        path?: string;
        status?: string;
        staged?: boolean;
    }>, "many">;
    unstaged: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodString;
        staged: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        path?: string;
        status?: string;
        staged?: boolean;
    }, {
        path?: string;
        status?: string;
        staged?: boolean;
    }>, "many">;
    untracked: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    staged?: {
        path?: string;
        status?: string;
        staged?: boolean;
    }[];
    branch?: string;
    ahead?: number;
    behind?: number;
    unstaged?: {
        path?: string;
        status?: string;
        staged?: boolean;
    }[];
    untracked?: string[];
}, {
    staged?: {
        path?: string;
        status?: string;
        staged?: boolean;
    }[];
    branch?: string;
    ahead?: number;
    behind?: number;
    unstaged?: {
        path?: string;
        status?: string;
        staged?: boolean;
    }[];
    untracked?: string[];
}>;
export declare const gitStatusTool: ToolDefinition<typeof GitStatusParamsSchema, typeof GitStatusReturnsSchema>;
declare const GitDiffParamsSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    staged: z.ZodDefault<z.ZodBoolean>;
    uncommitted: z.ZodDefault<z.ZodBoolean>;
    commitRange: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    staged?: boolean;
    uncommitted?: boolean;
    commitRange?: string;
}, {
    path?: string;
    staged?: boolean;
    uncommitted?: boolean;
    commitRange?: string;
}>;
declare const GitDiffReturnsSchema: z.ZodObject<{
    diff: z.ZodString;
    filesChanged: z.ZodNumber;
    insertions: z.ZodNumber;
    deletions: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    diff?: string;
    filesChanged?: number;
    insertions?: number;
    deletions?: number;
}, {
    diff?: string;
    filesChanged?: number;
    insertions?: number;
    deletions?: number;
}>;
export declare const gitDiffTool: ToolDefinition<typeof GitDiffParamsSchema, typeof GitDiffReturnsSchema>;
declare const GitLogParamsSchema: z.ZodObject<{
    maxCommits: z.ZodDefault<z.ZodNumber>;
    path: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    since: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    author?: string;
    maxCommits?: number;
    since?: string;
}, {
    path?: string;
    author?: string;
    maxCommits?: number;
    since?: string;
}>;
declare const GitLogReturnsSchema: z.ZodObject<{
    commits: z.ZodArray<z.ZodObject<{
        hash: z.ZodString;
        shortHash: z.ZodString;
        author: z.ZodString;
        date: z.ZodString;
        message: z.ZodString;
        files: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        message?: string;
        date?: string;
        hash?: string;
        shortHash?: string;
        author?: string;
        files?: string[];
    }, {
        message?: string;
        date?: string;
        hash?: string;
        shortHash?: string;
        author?: string;
        files?: string[];
    }>, "many">;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    commits?: {
        message?: string;
        date?: string;
        hash?: string;
        shortHash?: string;
        author?: string;
        files?: string[];
    }[];
    total?: number;
}, {
    commits?: {
        message?: string;
        date?: string;
        hash?: string;
        shortHash?: string;
        author?: string;
        files?: string[];
    }[];
    total?: number;
}>;
export declare const gitLogTool: ToolDefinition<typeof GitLogParamsSchema, typeof GitLogReturnsSchema>;
declare const GitBranchParamsSchema: z.ZodObject<{
    action: z.ZodEnum<["list", "create", "delete", "checkout"]>;
    name: z.ZodOptional<z.ZodString>;
    base: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string;
    action?: "list" | "create" | "delete" | "checkout";
    base?: string;
}, {
    name?: string;
    action?: "list" | "create" | "delete" | "checkout";
    base?: string;
}>;
declare const GitBranchReturnsSchema: z.ZodObject<{
    branch: z.ZodString;
    created: z.ZodOptional<z.ZodBoolean>;
    deleted: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    created?: boolean;
    branch?: string;
    deleted?: boolean;
}, {
    created?: boolean;
    branch?: string;
    deleted?: boolean;
}>;
export declare const gitBranchTool: ToolDefinition<typeof GitBranchParamsSchema, typeof GitBranchReturnsSchema>;
declare const GitInitReturnsSchema: z.ZodObject<{
    initialized: z.ZodBoolean;
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path?: string;
    initialized?: boolean;
}, {
    path?: string;
    initialized?: boolean;
}>;
export declare const gitInitTool: ToolDefinition<z.ZodObject<{}>, typeof GitInitReturnsSchema>;
declare const GitAddParamsSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    files?: string[];
}, {
    files?: string[];
}>;
declare const GitAddReturnsSchema: z.ZodObject<{
    added: z.ZodArray<z.ZodString, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count?: number;
    added?: string[];
}, {
    count?: number;
    added?: string[];
}>;
export declare const gitAddTool: ToolDefinition<typeof GitAddParamsSchema, typeof GitAddReturnsSchema>;
declare const GitCommitParamsSchema: z.ZodObject<{
    message: z.ZodString;
    authorName: z.ZodOptional<z.ZodString>;
    authorEmail: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message?: string;
    authorName?: string;
    authorEmail?: string;
}, {
    message?: string;
    authorName?: string;
    authorEmail?: string;
}>;
declare const GitCommitReturnsSchema: z.ZodObject<{
    committed: z.ZodBoolean;
    hash: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message?: string;
    hash?: string;
    committed?: boolean;
}, {
    message?: string;
    hash?: string;
    committed?: boolean;
}>;
export declare const gitCommitTool: ToolDefinition<typeof GitCommitParamsSchema, typeof GitCommitReturnsSchema>;
declare const GitPushParamsSchema: z.ZodObject<{
    remote: z.ZodString;
    branch: z.ZodString;
    setUpstream: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    branch?: string;
    remote?: string;
    setUpstream?: boolean;
}, {
    branch?: string;
    remote?: string;
    setUpstream?: boolean;
}>;
declare const GitPushReturnsSchema: z.ZodObject<{
    pushed: z.ZodBoolean;
    remote: z.ZodString;
    branch: z.ZodString;
}, "strip", z.ZodTypeAny, {
    branch?: string;
    remote?: string;
    pushed?: boolean;
}, {
    branch?: string;
    remote?: string;
    pushed?: boolean;
}>;
export declare const gitPushTool: ToolDefinition<typeof GitPushParamsSchema, typeof GitPushReturnsSchema>;
export {};
//# sourceMappingURL=git.d.ts.map