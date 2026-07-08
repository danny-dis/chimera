/**
 * Evaluation harness for Chimera — trajectory replay, cost/quality metrics,
 * failure analysis, and benchmark adapters.
 */
export interface TaskSpec {
    id: string;
    description: string;
    repoFixture?: string;
    expectedFiles?: string[];
    expectedTests?: boolean;
    acceptanceCriteria?: string[];
    maxCost?: number;
    maxTokens?: number;
}
export interface TrajectoryStep {
    timestamp: number;
    type: 'user_request' | 'agent_call' | 'tool_call' | 'tool_result' | 'patch' | 'check' | 'response';
    agentId?: string;
    role?: string;
    provider?: string;
    model?: string;
    input?: unknown;
    output?: unknown;
    tokens?: {
        input: number;
        output: number;
    };
    cost?: number;
    duration?: number;
    error?: string;
}
export interface Trajectory {
    taskId: string;
    repoSha?: string;
    config: Record<string, unknown>;
    steps: TrajectoryStep[];
    finalOutput: string;
    totalCost: number;
    totalTokens: {
        input: number;
        output: number;
    };
    duration: number;
}
export interface EvalScore {
    taskId: string;
    success: boolean;
    passRate: number;
    qualityScore: number;
    costScore: number;
    latencyScore: number;
    overallScore: number;
    metrics: Record<string, number>;
    failureCategory?: string;
    notes?: string;
    judge?: import('./judge-llm.js').JudgeVerdict;
}
export interface EvalReport {
    runId: string;
    timestamp: number;
    tasks: EvalScore[];
    summary: {
        totalTasks: number;
        passed: number;
        failed: number;
        passRate: number;
        avgCost: number;
        avgLatency: number;
        avgQuality: number;
        costSavingsVsFrontier: number;
    };
    failureBreakdown: Record<string, number>;
}
export declare class EvalHarness {
    private trajectories;
    private tasks;
    registerTask(spec: TaskSpec): void;
    recordTrajectory(trajectory: Trajectory): void;
    scoreTask(taskId: string, judgeVerdict?: import('./judge-llm.js').JudgeVerdict): EvalScore | null;
    generateReport(runId: string, verdicts?: Map<string, import('./judge-llm.js').JudgeVerdict>): EvalReport;
    replayTrajectory(taskId: string): TrajectoryStep[] | null;
    compareRuns(runA: EvalReport, runB: EvalReport): {
        passRateDelta: number;
        costDelta: number;
        qualityDelta: number;
        improvedTasks: string[];
        regressedTasks: string[];
    };
    private evaluateSuccess;
    private evaluateQuality;
    private evaluateCost;
    private evaluateLatency;
    private classifyFailure;
    private estimateCostSavings;
}
//# sourceMappingURL=eval-harness.d.ts.map