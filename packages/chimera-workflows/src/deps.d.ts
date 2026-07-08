/**
 * Stub types for workflow dependencies.
 * These were part of the original archon DI container.
 * For chimera, these are minimal interface definitions.
 */
export interface WorkflowDeps {
    loadConfig(cwd: string): Promise<WorkflowConfig>;
    store: WorkflowStore;
    resolveBotGitHubToken?(owner: string, repo: string): Promise<string | undefined>;
    getUserGithubToken?(userId: string): Promise<string | undefined>;
    isPerUserGitHubEnabled?(): boolean;
    getUserAiPrefs?(userId: string): Promise<UserAiPrefs>;
    isPerUserProviderKeysEnabled?(): boolean;
    getUserProviderEnv?(userId: string, artifactsDir: string): Promise<{
        env: Record<string, string>;
        files: Array<{
            path: string;
            contents: string;
        }>;
    }>;
}
export interface WorkflowStore {
    getCodebase(id: string): Promise<{
        name: string;
        repository_url?: string;
    } | null>;
    getCodebaseEnvVars(codebaseId: string): Promise<Record<string, string>>;
    createWorkflowRun(record: Record<string, unknown>): Promise<WorkflowRun>;
    updateWorkflowRun(id: string, update: Record<string, unknown>): Promise<void>;
    failWorkflowRun(id: string, error: string): Promise<void>;
    getWorkflowRun(id: string): Promise<WorkflowRun | null>;
    getWorkflowRunStatus(id: string): Promise<string | null>;
    getActiveWorkflowRunByPath(path: string, opts: {
        id: string;
        startedAt: Date;
    }): Promise<WorkflowRun | null>;
    resumeWorkflowRun(id: string): Promise<WorkflowRun>;
    getCompletedDagNodeOutputs(runId: string): Promise<Map<string, string>>;
    createWorkflowEvent(record: Record<string, unknown>): Promise<void>;
}
export interface WorkflowRun {
    id: string;
    status: string;
    workflow_name: string;
    started_at: string;
    metadata?: Record<string, unknown>;
}
export interface WorkflowConfig {
    assistant?: string;
    baseBranch?: string;
    docsPath?: string;
    envVars?: Record<string, string>;
    commands?: {
        folder?: string;
    };
    defaults?: {
        loadDefaultCommands?: boolean;
    };
    tiers?: Record<string, {
        provider: string;
        model: string;
        effort?: string;
    }>;
    aliases?: Record<string, {
        provider: string;
        model: string;
        effort?: string;
    }>;
    assistants?: Record<string, {
        model?: string;
    }>;
}
export interface IWorkflowPlatform {
    sendMessage(conversationId: string, message: string, metadata?: WorkflowMessageMetadata): Promise<void>;
    getPlatformType(): string;
}
export interface WorkflowMessageMetadata {
    category?: string;
    segment?: string;
    [key: string]: unknown;
}
export interface UserAiPrefs {
    tiers?: Record<string, {
        provider: string;
        model: string;
        effort?: string;
    }>;
    aliases?: Record<string, {
        provider: string;
        model: string;
        effort?: string;
    }>;
    defaultProvider?: string;
}
//# sourceMappingURL=deps.d.ts.map