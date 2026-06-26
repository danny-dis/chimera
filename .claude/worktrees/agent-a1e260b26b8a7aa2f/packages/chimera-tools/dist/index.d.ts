export { type ToolDefinition, type ToolContext, type ToolResult, type ValidationResult, type PermissionDecision, type ToolCategory, type PermissionLevel, type FileEntry, type SearchMatch, type GitFileStatus, type GitCommit, PathSchema, FileEntrySchema, SearchMatchSchema, GitFileStatusSchema, GitCommitSchema, MAX_FILE_SIZE, MAX_OUTPUT_SIZE, DEFAULT_SHELL_TIMEOUT, MAX_SHELL_TIMEOUT, IGNORED_DIRS, } from './tool-schema.js';
export { TOOL_DEFAULTS, buildTool, type ToolDefinitionInput } from './tool-builder.js';
export { ToolRegistry } from './tool-registry.js';
export { ToolExecutor, type PermissionChecker } from './tool-executor.js';
export { readFileTool, writeFileTool, listDirectoryTool } from './tools/filesystem.js';
export { searchFilesTool, globFilesTool } from './tools/search.js';
export { runShellCommandTool } from './tools/shell.js';
export { gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool } from './tools/git.js';
export { applyPatchTool, editBlockTool, searchReplaceTool } from './tools/edit.js';
export { webFetchTool, webSearchTool } from './tools/web.js';
export { todoWriteTool, todoReadTool, questionTool } from './tools/todo.js';
export { taskCreateTool, taskListTool, taskUpdateTool, TaskSchema, TaskStatusSchema } from './tools/task.js';
export type { Task, TaskStatus } from './tools/task.js';
export { skillLoadTool } from './tools/skill.js';
export { lspTool } from './tools/lsp.js';
export { McpClient, McpManager } from './mcp-client.js';
export type { McpServerConfig } from './mcp-client.js';
export declare const allTools: readonly [import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodString;
    startLine: import("zod").ZodOptional<import("zod").ZodNumber>;
    endLine: import("zod").ZodOptional<import("zod").ZodNumber>;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
}, {
    path: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
}>, import("zod").ZodObject<{
    content: import("zod").ZodString;
    totalLines: import("zod").ZodNumber;
    path: import("zod").ZodString;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    content: string;
    totalLines: number;
}, {
    path: string;
    content: string;
    totalLines: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodString;
    content: import("zod").ZodString;
    overwrite: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    content: string;
    overwrite: boolean;
}, {
    path: string;
    content: string;
    overwrite?: boolean | undefined;
}>, import("zod").ZodObject<{
    path: import("zod").ZodString;
    bytesWritten: import("zod").ZodNumber;
    created: import("zod").ZodBoolean;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    bytesWritten: number;
    created: boolean;
}, {
    path: string;
    bytesWritten: number;
    created: boolean;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodOptional<import("zod").ZodString>;
    depth: import("zod").ZodDefault<import("zod").ZodNumber>;
    includeHidden: import("zod").ZodDefault<import("zod").ZodBoolean>;
    gitignore: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    depth: number;
    includeHidden: boolean;
    gitignore: boolean;
    path?: string | undefined;
}, {
    path?: string | undefined;
    depth?: number | undefined;
    includeHidden?: boolean | undefined;
    gitignore?: boolean | undefined;
}>, import("zod").ZodObject<{
    entries: import("zod").ZodArray<import("zod").ZodObject<{
        name: import("zod").ZodString;
        path: import("zod").ZodString;
        type: import("zod").ZodEnum<["file", "directory", "symlink"]>;
        size: import("zod").ZodOptional<import("zod").ZodNumber>;
        modified: import("zod").ZodOptional<import("zod").ZodString>;
    }, "strip", import("zod").ZodTypeAny, {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }, {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }>, "many">;
    path: import("zod").ZodString;
    totalFiles: import("zod").ZodNumber;
    totalDirs: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    entries: {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }[];
    totalFiles: number;
    totalDirs: number;
}, {
    path: string;
    entries: {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }[];
    totalFiles: number;
    totalDirs: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    pattern: import("zod").ZodString;
    path: import("zod").ZodOptional<import("zod").ZodString>;
    include: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
    exclude: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodString, "many">>;
    caseSensitive: import("zod").ZodDefault<import("zod").ZodBoolean>;
    maxResults: import("zod").ZodDefault<import("zod").ZodNumber>;
}, "strip", import("zod").ZodTypeAny, {
    pattern: string;
    caseSensitive: boolean;
    maxResults: number;
    path?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
}, {
    pattern: string;
    path?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    caseSensitive?: boolean | undefined;
    maxResults?: number | undefined;
}>, import("zod").ZodObject<{
    matches: import("zod").ZodArray<import("zod").ZodObject<{
        file: import("zod").ZodString;
        line: import("zod").ZodNumber;
        column: import("zod").ZodNumber;
        match: import("zod").ZodString;
        context: import("zod").ZodOptional<import("zod").ZodObject<{
            before: import("zod").ZodString;
            after: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
            before: string;
            after: string;
        }, {
            before: string;
            after: string;
        }>>;
    }, "strip", import("zod").ZodTypeAny, {
        file: string;
        line: number;
        column: number;
        match: string;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }, {
        file: string;
        line: number;
        column: number;
        match: string;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }>, "many">;
    totalMatches: import("zod").ZodNumber;
    filesSearched: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    matches: {
        file: string;
        line: number;
        column: number;
        match: string;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }[];
    totalMatches: number;
    filesSearched: number;
}, {
    matches: {
        file: string;
        line: number;
        column: number;
        match: string;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }[];
    totalMatches: number;
    filesSearched: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    pattern: import("zod").ZodString;
    path: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
}, {
    pattern: string;
    path?: string | undefined;
}>, import("zod").ZodObject<{
    files: import("zod").ZodArray<import("zod").ZodString, "many">;
    count: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    files: string[];
    count: number;
}, {
    files: string[];
    count: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    command: import("zod").ZodString;
    cwd: import("zod").ZodOptional<import("zod").ZodString>;
    timeout: import("zod").ZodDefault<import("zod").ZodNumber>;
    env: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
}, "strip", import("zod").ZodTypeAny, {
    timeout: number;
    command: string;
    cwd?: string | undefined;
    env?: Record<string, string> | undefined;
}, {
    command: string;
    cwd?: string | undefined;
    timeout?: number | undefined;
    env?: Record<string, string> | undefined;
}>, import("zod").ZodObject<{
    stdout: import("zod").ZodString;
    stderr: import("zod").ZodString;
    exitCode: import("zod").ZodNumber;
    duration: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    duration: number;
    stdout: string;
    stderr: string;
    exitCode: number;
}, {
    duration: number;
    stdout: string;
    stderr: string;
    exitCode: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    path?: string | undefined;
}, {
    path?: string | undefined;
}>, import("zod").ZodObject<{
    branch: import("zod").ZodString;
    ahead: import("zod").ZodNumber;
    behind: import("zod").ZodNumber;
    staged: import("zod").ZodArray<import("zod").ZodObject<{
        path: import("zod").ZodString;
        status: import("zod").ZodString;
        staged: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, "strip", import("zod").ZodTypeAny, {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }, {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }>, "many">;
    unstaged: import("zod").ZodArray<import("zod").ZodObject<{
        path: import("zod").ZodString;
        status: import("zod").ZodString;
        staged: import("zod").ZodOptional<import("zod").ZodBoolean>;
    }, "strip", import("zod").ZodTypeAny, {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }, {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }>, "many">;
    untracked: import("zod").ZodArray<import("zod").ZodString, "many">;
}, "strip", import("zod").ZodTypeAny, {
    staged: {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }[];
    branch: string;
    ahead: number;
    behind: number;
    unstaged: {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }[];
    untracked: string[];
}, {
    staged: {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }[];
    branch: string;
    ahead: number;
    behind: number;
    unstaged: {
        path: string;
        status: string;
        staged?: boolean | undefined;
    }[];
    untracked: string[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodOptional<import("zod").ZodString>;
    staged: import("zod").ZodDefault<import("zod").ZodBoolean>;
    uncommitted: import("zod").ZodDefault<import("zod").ZodBoolean>;
    commitRange: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    staged: boolean;
    uncommitted: boolean;
    path?: string | undefined;
    commitRange?: string | undefined;
}, {
    path?: string | undefined;
    staged?: boolean | undefined;
    uncommitted?: boolean | undefined;
    commitRange?: string | undefined;
}>, import("zod").ZodObject<{
    diff: import("zod").ZodString;
    filesChanged: import("zod").ZodNumber;
    insertions: import("zod").ZodNumber;
    deletions: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    diff: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
}, {
    diff: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    maxCommits: import("zod").ZodDefault<import("zod").ZodNumber>;
    path: import("zod").ZodOptional<import("zod").ZodString>;
    author: import("zod").ZodOptional<import("zod").ZodString>;
    since: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    maxCommits: number;
    path?: string | undefined;
    author?: string | undefined;
    since?: string | undefined;
}, {
    path?: string | undefined;
    author?: string | undefined;
    maxCommits?: number | undefined;
    since?: string | undefined;
}>, import("zod").ZodObject<{
    commits: import("zod").ZodArray<import("zod").ZodObject<{
        hash: import("zod").ZodString;
        shortHash: import("zod").ZodString;
        author: import("zod").ZodString;
        date: import("zod").ZodString;
        message: import("zod").ZodString;
        files: import("zod").ZodArray<import("zod").ZodString, "many">;
    }, "strip", import("zod").ZodTypeAny, {
        message: string;
        date: string;
        hash: string;
        shortHash: string;
        author: string;
        files: string[];
    }, {
        message: string;
        date: string;
        hash: string;
        shortHash: string;
        author: string;
        files: string[];
    }>, "many">;
    total: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    commits: {
        message: string;
        date: string;
        hash: string;
        shortHash: string;
        author: string;
        files: string[];
    }[];
    total: number;
}, {
    commits: {
        message: string;
        date: string;
        hash: string;
        shortHash: string;
        author: string;
        files: string[];
    }[];
    total: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    action: import("zod").ZodEnum<["list", "create", "delete", "checkout"]>;
    name: import("zod").ZodOptional<import("zod").ZodString>;
    base: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    action: "list" | "create" | "delete" | "checkout";
    name?: string | undefined;
    base?: string | undefined;
}, {
    action: "list" | "create" | "delete" | "checkout";
    name?: string | undefined;
    base?: string | undefined;
}>, import("zod").ZodObject<{
    branch: import("zod").ZodString;
    created: import("zod").ZodOptional<import("zod").ZodBoolean>;
    deleted: import("zod").ZodOptional<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    branch: string;
    created?: boolean | undefined;
    deleted?: boolean | undefined;
}, {
    branch: string;
    created?: boolean | undefined;
    deleted?: boolean | undefined;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    patch: import("zod").ZodString;
    path: import("zod").ZodOptional<import("zod").ZodString>;
    dryRun: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    patch: string;
    dryRun: boolean;
    path?: string | undefined;
}, {
    patch: string;
    path?: string | undefined;
    dryRun?: boolean | undefined;
}>, import("zod").ZodObject<{
    applied: import("zod").ZodBoolean;
    filesChanged: import("zod").ZodArray<import("zod").ZodString, "many">;
    hunksApplied: import("zod").ZodNumber;
    hunksFailed: import("zod").ZodNumber;
    rejectFiles: import("zod").ZodArray<import("zod").ZodString, "many">;
}, "strip", import("zod").ZodTypeAny, {
    filesChanged: string[];
    applied: boolean;
    hunksApplied: number;
    hunksFailed: number;
    rejectFiles: string[];
}, {
    filesChanged: string[];
    applied: boolean;
    hunksApplied: number;
    hunksFailed: number;
    rejectFiles: string[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    path: import("zod").ZodString;
    oldText: import("zod").ZodString;
    newText: import("zod").ZodString;
    replaceAll: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    replaceAll: boolean;
    oldText: string;
    newText: string;
}, {
    path: string;
    oldText: string;
    newText: string;
    replaceAll?: boolean | undefined;
}>, import("zod").ZodObject<{
    applied: import("zod").ZodBoolean;
    path: import("zod").ZodString;
    replacements: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    applied: boolean;
    replacements: number;
}, {
    path: string;
    applied: boolean;
    replacements: number;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodEffects<import("zod").ZodObject<{
    path: import("zod").ZodString;
    blocks: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
        search: import("zod").ZodString;
        replace: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        search: string;
        replace: string;
    }, {
        search: string;
        replace: string;
    }>, "many">>;
    text: import("zod").ZodOptional<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}>, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}>, import("zod").ZodObject<{
    applied: import("zod").ZodBoolean;
    path: import("zod").ZodString;
    replacements: import("zod").ZodNumber;
    failures: import("zod").ZodArray<import("zod").ZodObject<{
        search: import("zod").ZodString;
        reason: import("zod").ZodString;
        similarLines: import("zod").ZodArray<import("zod").ZodString, "many">;
    }, "strip", import("zod").ZodTypeAny, {
        search: string;
        reason: string;
        similarLines: string[];
    }, {
        search: string;
        reason: string;
        similarLines: string[];
    }>, "many">;
}, "strip", import("zod").ZodTypeAny, {
    path: string;
    applied: boolean;
    replacements: number;
    failures: {
        search: string;
        reason: string;
        similarLines: string[];
    }[];
}, {
    path: string;
    applied: boolean;
    replacements: number;
    failures: {
        search: string;
        reason: string;
        similarLines: string[];
    }[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    url: import("zod").ZodString;
    format: import("zod").ZodDefault<import("zod").ZodEnum<["markdown", "text", "html"]>>;
    timeout: import("zod").ZodDefault<import("zod").ZodNumber>;
}, "strip", import("zod").ZodTypeAny, {
    timeout: number;
    url: string;
    format: "text" | "markdown" | "html";
}, {
    url: string;
    timeout?: number | undefined;
    format?: "text" | "markdown" | "html" | undefined;
}>, import("zod").ZodObject<{
    content: import("zod").ZodString;
    url: import("zod").ZodString;
    format: import("zod").ZodString;
}, "strip", import("zod").ZodTypeAny, {
    content: string;
    url: string;
    format: string;
}, {
    content: string;
    url: string;
    format: string;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    query: import("zod").ZodString;
    numResults: import("zod").ZodDefault<import("zod").ZodNumber>;
    type: import("zod").ZodDefault<import("zod").ZodEnum<["fast", "deep", "auto"]>>;
}, "strip", import("zod").ZodTypeAny, {
    type: "fast" | "deep" | "auto";
    query: string;
    numResults: number;
}, {
    query: string;
    type?: "fast" | "deep" | "auto" | undefined;
    numResults?: number | undefined;
}>, import("zod").ZodObject<{
    results: import("zod").ZodArray<import("zod").ZodObject<{
        title: import("zod").ZodString;
        url: import("zod").ZodString;
        snippet: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        url: string;
        title: string;
        snippet: string;
    }, {
        url: string;
        title: string;
        snippet: string;
    }>, "many">;
    total: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    total: number;
    results: {
        url: string;
        title: string;
        snippet: string;
    }[];
}, {
    total: number;
    results: {
        url: string;
        title: string;
        snippet: string;
    }[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    todos: import("zod").ZodArray<import("zod").ZodObject<{
        content: import("zod").ZodString;
        status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: import("zod").ZodOptional<import("zod").ZodEnum<["high", "medium", "low"]>>;
    }, "strip", import("zod").ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }>, "many">;
}, "strip", import("zod").ZodTypeAny, {
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}, {
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}>, import("zod").ZodObject<{
    todos: import("zod").ZodArray<import("zod").ZodObject<{
        content: import("zod").ZodString;
        status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: import("zod").ZodOptional<import("zod").ZodEnum<["high", "medium", "low"]>>;
    }, "strip", import("zod").ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }>, "many">;
    count: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    count: number;
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}, {
    count: number;
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodTypeAny, import("zod").ZodObject<{
    todos: import("zod").ZodArray<import("zod").ZodObject<{
        content: import("zod").ZodString;
        status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: import("zod").ZodOptional<import("zod").ZodEnum<["high", "medium", "low"]>>;
    }, "strip", import("zod").ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }>, "many">;
}, "strip", import("zod").ZodTypeAny, {
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}, {
    todos: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        content: string;
        priority?: "high" | "medium" | "low" | undefined;
    }[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    question: import("zod").ZodString;
    header: import("zod").ZodString;
    options: import("zod").ZodArray<import("zod").ZodObject<{
        label: import("zod").ZodString;
        description: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        description: string;
        label: string;
    }, {
        description: string;
        label: string;
    }>, "many">;
    multiple: import("zod").ZodDefault<import("zod").ZodBoolean>;
}, "strip", import("zod").ZodTypeAny, {
    options: {
        description: string;
        label: string;
    }[];
    question: string;
    header: string;
    multiple: boolean;
}, {
    options: {
        description: string;
        label: string;
    }[];
    question: string;
    header: string;
    multiple?: boolean | undefined;
}>, import("zod").ZodObject<{
    answer: import("zod").ZodString;
}, "strip", import("zod").ZodTypeAny, {
    answer: string;
}, {
    answer: string;
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    subject: import("zod").ZodString;
    description: import("zod").ZodString;
    activeForm: import("zod").ZodOptional<import("zod").ZodString>;
    metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
}, "strip", import("zod").ZodTypeAny, {
    description: string;
    subject: string;
    activeForm?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    description: string;
    subject: string;
    activeForm?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>, import("zod").ZodObject<{
    task: import("zod").ZodObject<{
        id: import("zod").ZodString;
        subject: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        id: string;
        subject: string;
    }, {
        id: string;
        subject: string;
    }>;
}, "strip", import("zod").ZodTypeAny, {
    task: {
        id: string;
        subject: string;
    };
}, {
    task: {
        id: string;
        subject: string;
    };
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{}, "strip", import("zod").ZodTypeAny, {}, {}>, import("zod").ZodObject<{
    tasks: import("zod").ZodArray<import("zod").ZodObject<{
        id: import("zod").ZodString;
        subject: import("zod").ZodString;
        description: import("zod").ZodString;
        activeForm: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
        createdAt: import("zod").ZodString;
        updatedAt: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    count: import("zod").ZodNumber;
}, "strip", import("zod").ZodTypeAny, {
    count: number;
    tasks: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, {
    count: number;
    tasks: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    id: import("zod").ZodString;
    status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
}, "strip", import("zod").ZodTypeAny, {
    status: "pending" | "in_progress" | "completed" | "cancelled";
    id: string;
}, {
    status: "pending" | "in_progress" | "completed" | "cancelled";
    id: string;
}>, import("zod").ZodObject<{
    task: import("zod").ZodObject<{
        id: import("zod").ZodString;
        subject: import("zod").ZodString;
        description: import("zod").ZodString;
        activeForm: import("zod").ZodOptional<import("zod").ZodString>;
        status: import("zod").ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        metadata: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
        createdAt: import("zod").ZodString;
        updatedAt: import("zod").ZodString;
    }, "strip", import("zod").ZodTypeAny, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", import("zod").ZodTypeAny, {
    task: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}, {
    task: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}>>, import("./tool-schema.js").ToolDefinition<import("zod").ZodObject<{
    skillName: import("zod").ZodString;
    args: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>>;
}, "strip", import("zod").ZodTypeAny, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}>, import("zod").ZodObject<{
    content: import("zod").ZodString;
    skillName: import("zod").ZodString;
}, "strip", import("zod").ZodTypeAny, {
    content: string;
    skillName: string;
}, {
    content: string;
    skillName: string;
}>>];
export { PermissionEngine, type PermissionProfile } from './permission/policy.js';
export { CommandPolicy } from './permission/command-policy.js';
export { PathRestrictionEngine } from './permission/path-restrictions.js';
export { Sandbox } from './sandbox/sandbox.js';
export { PTYExecutor } from './sandbox/pty-executor.js';
export { EnvironmentFilter } from './sandbox/env-filter.js';
export { SecretDetector } from './sandbox/secret-detector.js';
//# sourceMappingURL=index.d.ts.map