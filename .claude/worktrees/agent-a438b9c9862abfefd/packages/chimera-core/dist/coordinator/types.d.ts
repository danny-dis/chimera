import type { LLMProvider } from '../session-orchestrator.js';
export interface SubTask {
    id: string;
    description: string;
    dependencies: string[];
    context: string;
    provider: LLMProvider;
    estimatedTokens: number;
}
export interface SubTaskResult {
    subTaskId: string;
    status: 'success' | 'error' | 'timeout';
    output: string;
    tokensUsed: number;
    error?: string;
    durationMs: number;
}
export interface DecompositionResult {
    subTasks: SubTask[];
    strategy: 'parallel' | 'sequential' | 'mixed';
    rationale: string;
}
export interface AggregatedResult {
    output: string;
    conflicts: Conflict[];
    resolved: boolean;
    subTaskResults: SubTaskResult[];
    totalTokens: number;
}
export interface Conflict {
    subTaskIds: string[];
    type: 'contradiction' | 'overlap' | 'gap';
    description: string;
    resolution?: string;
}
export interface CoordinatorConfig {
    maxConcurrency: number;
    taskTimeoutMs: number;
    conflictResolution: 'auto' | 'escalate';
}
//# sourceMappingURL=types.d.ts.map