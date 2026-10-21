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
  verificationCommands?: string[];
  verificationOutputs?: string[];
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
  tokens?: { input: number; output: number };
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
  totalTokens: { input: number; output: number };
  duration: number;
}

export interface EvalScore {
  taskId: string;
  success: boolean;
  passRate: number;
  qualityScore: number;       // 0-1
  costScore: number;          // 0-1 (lower cost = higher score)
  latencyScore: number;       // 0-1 (faster = higher score)
  overallScore: number;       // weighted average
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
    costSavingsVsFrontier: number | null;  // null without a measured comparison
  };
  failureBreakdown: Record<string, number>;
}

type FailureCategory =
  | 'localization'
  | 'planning'
  | 'context'
  | 'patching'
  | 'tool'
  | 'test_interpretation'
  | 'model_refusal'
  | 'permission'
  | 'handoff_error'
  | 'cost_exceeded'
  | 'unknown';

export class EvalHarness {
  private trajectories: Map<string, Trajectory> = new Map();
  private tasks: Map<string, TaskSpec> = new Map();

  registerTask(spec: TaskSpec): void {
    this.tasks.set(spec.id, spec);
  }

  recordTrajectory(trajectory: Trajectory): void {
    this.trajectories.set(trajectory.taskId, trajectory);
  }

  scoreTask(taskId: string, judgeVerdict?: import('./judge-llm.js').JudgeVerdict): EvalScore | null {
    const task = this.tasks.get(taskId);
    const trajectory = this.trajectories.get(taskId);
    if (!task || !trajectory) return null;

    const success = this.evaluateSuccess(task, trajectory);
    const heuristicQuality = this.evaluateQuality(task, trajectory);
    const costScore = this.evaluateCost(task, trajectory);
    const latencyScore = this.evaluateLatency(task, trajectory);
    const failureCategory = success ? undefined : this.classifyFailure(task, trajectory);

    // Use judge verdict quality if provided, otherwise use heuristic
    const qualityScore = judgeVerdict?.score ?? heuristicQuality;
    
    let notes: string | undefined = 'Heuristic quality is activity-based, not a correctness or comparative-performance measurement.';
    if (judgeVerdict) {
      const pct = Math.round(judgeVerdict.score * 100);
      notes = `Judge score: ${pct}% — ${judgeVerdict.rationale}`;
    }

    const overallScore = (qualityScore * 0.4) + (costScore * 0.3) + (latencyScore * 0.3);

    return {
      taskId,
      success,
      passRate: success ? 1 : 0,
      qualityScore,
      costScore,
      latencyScore,
      overallScore,
      metrics: {
        totalTokens: trajectory.totalTokens.input + trajectory.totalTokens.output,
        totalSteps: trajectory.steps.length,
        toolCalls: trajectory.steps.filter(s => s.type === 'tool_call').length,
        patches: trajectory.steps.filter(s => s.type === 'patch').length,
        errors: trajectory.steps.filter(s => s.error).length,
      },
      failureCategory,
      ...(judgeVerdict ? { judge: judgeVerdict } : {}),
      ...(notes ? { notes } : {}),
    };
  }

  generateReport(runId: string, verdicts?: Map<string, import('./judge-llm.js').JudgeVerdict>): EvalReport {
    const tasks: EvalScore[] = [];
    for (const taskId of this.tasks.keys()) {
      const verdict = verdicts?.get(taskId);
      const score = this.scoreTask(taskId, verdict);
      if (score) tasks.push(score);
    }

    const passed = tasks.filter(t => t.success).length;
    const failed = tasks.length - passed;
    const passRate = tasks.length > 0 ? passed / tasks.length : 0;

    const avgCost = tasks.length > 0
      ? tasks.reduce((sum, t) => sum + (this.trajectories.get(t.taskId)?.totalCost ?? 0), 0) / tasks.length
      : 0;

    const avgLatency = tasks.length > 0
      ? tasks.reduce((sum, t) => sum + (this.trajectories.get(t.taskId)?.duration ?? 0), 0) / tasks.length
      : 0;

    const avgQuality = tasks.length > 0
      ? tasks.reduce((sum, t) => sum + t.qualityScore, 0) / tasks.length
      : 0;

    const failureBreakdown: Record<string, number> = {};
    for (const task of tasks) {
      if (task.failureCategory) {
        failureBreakdown[task.failureCategory] = (failureBreakdown[task.failureCategory] ?? 0) + 1;
      }
    }

    return {
      runId,
      timestamp: Date.now(),
      tasks,
      summary: {
        totalTasks: tasks.length,
        passed,
        failed,
        passRate,
        avgCost,
        avgLatency,
        avgQuality,
        costSavingsVsFrontier: null,
      },
      failureBreakdown,
    };
  }

  replayTrajectory(taskId: string): TrajectoryStep[] | null {
    return this.trajectories.get(taskId)?.steps ?? null;
  }

  compareRuns(runA: EvalReport, runB: EvalReport): {
    passRateDelta: number;
    costDelta: number;
    qualityDelta: number;
    improvedTasks: string[];
    regressedTasks: string[];
  } {
    const aScores = new Map(runA.tasks.map(t => [t.taskId, t]));
    const bScores = new Map(runB.tasks.map(t => [t.taskId, t]));

    const improvedTasks: string[] = [];
    const regressedTasks: string[] = [];

    for (const [taskId, aScore] of aScores) {
      const bScore = bScores.get(taskId);
      if (bScore) {
        if (bScore.overallScore > aScore.overallScore) improvedTasks.push(taskId);
        if (bScore.overallScore < aScore.overallScore) regressedTasks.push(taskId);
      }
    }

    return {
      passRateDelta: runB.summary.passRate - runA.summary.passRate,
      costDelta: runB.summary.avgCost - runA.summary.avgCost,
      qualityDelta: runB.summary.avgQuality - runA.summary.avgQuality,
      improvedTasks,
      regressedTasks,
    };
  }

  private evaluateSuccess(task: TaskSpec, trajectory: Trajectory): boolean {
    if (trajectory.steps.some(s => s.error && s.type === 'check')) return false;
    if (!Number.isFinite(trajectory.totalCost) || trajectory.totalCost < 0) return false;
    const tokens = trajectory.totalTokens;
    if (!Number.isSafeInteger(tokens?.input) || tokens.input < 0 || !Number.isSafeInteger(tokens?.output) || tokens.output < 0) return false;
    if (task.maxTokens !== undefined && trajectory.config.tokensMeasured === false) return false;
    if (task.maxCost !== undefined && (!Number.isFinite(task.maxCost) || task.maxCost < 0 || trajectory.totalCost > task.maxCost)) return false;
    if (task.maxTokens !== undefined && (!Number.isFinite(task.maxTokens) || task.maxTokens < 0 || trajectory.totalTokens.input + trajectory.totalTokens.output > task.maxTokens)) return false;
    const check = trajectory.steps.filter(s => s.type === 'check').at(-1)?.output as {
      pass?: boolean; files?: string[];
      verification?: { verified?: boolean; bundle?: { evidences?: Array<{ type: string; verdict: string; description?: string; data?: { exitCode?: number } }> } };
    } | undefined;
    if (check?.pass !== true || check.verification?.verified !== true) return false;
    const evidence = check.verification.bundle?.evidences;
    if (!Array.isArray(evidence) || evidence.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.type !== 'string' || typeof item.verdict !== 'string')) return false;
    const tests = evidence.filter(item => item.type === 'test_result');
    if (!tests.length || tests.some(item => item.verdict !== 'pass' || item.data?.exitCode !== 0)) return false;
    if (task.verificationCommands?.some(command => !tests.some(item => item.description === command))) return false;
    if (task.expectedFiles?.some(file => !Array.isArray(check.files) || !check.files.includes(file))) return false;
    if (task.acceptanceCriteria?.length && !task.verificationCommands?.length) return false;
    const lastResponse = trajectory.steps.filter(s => s.type === 'response').pop();
    return Boolean(lastResponse);
  }

  private evaluateQuality(_task: TaskSpec, trajectory: Trajectory): number {
    let score = 0.5;
    if (trajectory.steps.some(s => s.type === 'patch')) score += 0.15;
    if (trajectory.steps.some(s => s.type === 'check' && !s.error)) score += 0.15;
    const toolCalls = trajectory.steps.filter(s => s.type === 'tool_call').length;
    if (toolCalls > 0 && toolCalls < 20) score += 0.1;
    const errors = trajectory.steps.filter(s => s.error).length;
    if (errors === 0) score += 0.1;
    return Math.min(1, score);
  }

  private evaluateCost(task: TaskSpec, trajectory: Trajectory): number {
    const maxCost = task.maxCost ?? 5.0;
    if (trajectory.totalCost === 0) return 1;
    return Math.max(0, 1 - (trajectory.totalCost / maxCost));
  }

  private evaluateLatency(_task: TaskSpec, trajectory: Trajectory): number {
    const maxDuration = 300_000; // 5 minutes
    if (trajectory.duration === 0) return 1;
    return Math.max(0, 1 - (trajectory.duration / maxDuration));
  }

  private classifyFailure(_task: TaskSpec, trajectory: Trajectory): FailureCategory {
    const errors = trajectory.steps.filter(s => s.error);
    for (const error of errors) {
      const msg = error.error?.toLowerCase() ?? '';
      if (msg.includes('permission') || msg.includes('denied')) return 'permission';
      if (msg.includes('cost') || msg.includes('budget')) return 'cost_exceeded';
      if (msg.includes('handoff')) return 'handoff_error';
      if (msg.includes('test') || msg.includes('assertion')) return 'test_interpretation';
      if (msg.includes('patch') || msg.includes('diff') || msg.includes('apply')) return 'patching';
      if (msg.includes('tool') || msg.includes('command')) return 'tool';
    }
    const patches = trajectory.steps.filter(s => s.type === 'patch');
    if (patches.length === 0) return 'planning';
    return 'unknown';
  }
}
