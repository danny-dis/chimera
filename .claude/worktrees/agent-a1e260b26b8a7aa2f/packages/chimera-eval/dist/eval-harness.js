"use strict";
/**
 * Evaluation harness for Chimera — trajectory replay, cost/quality metrics,
 * failure analysis, and benchmark adapters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvalHarness = void 0;
class EvalHarness {
    trajectories = new Map();
    tasks = new Map();
    registerTask(spec) {
        this.tasks.set(spec.id, spec);
    }
    recordTrajectory(trajectory) {
        this.trajectories.set(trajectory.taskId, trajectory);
    }
    scoreTask(taskId) {
        const task = this.tasks.get(taskId);
        const trajectory = this.trajectories.get(taskId);
        if (!task || !trajectory)
            return null;
        const success = this.evaluateSuccess(task, trajectory);
        const qualityScore = this.evaluateQuality(task, trajectory);
        const costScore = this.evaluateCost(task, trajectory);
        const latencyScore = this.evaluateLatency(task, trajectory);
        const failureCategory = success ? undefined : this.classifyFailure(task, trajectory);
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
        };
    }
    generateReport(runId) {
        const tasks = [];
        for (const taskId of this.tasks.keys()) {
            const score = this.scoreTask(taskId);
            if (score)
                tasks.push(score);
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
        const failureBreakdown = {};
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
                costSavingsVsFrontier: this.estimateCostSavings(tasks),
            },
            failureBreakdown,
        };
    }
    replayTrajectory(taskId) {
        return this.trajectories.get(taskId)?.steps ?? null;
    }
    compareRuns(runA, runB) {
        const aScores = new Map(runA.tasks.map(t => [t.taskId, t]));
        const bScores = new Map(runB.tasks.map(t => [t.taskId, t]));
        const improvedTasks = [];
        const regressedTasks = [];
        for (const [taskId, aScore] of aScores) {
            const bScore = bScores.get(taskId);
            if (bScore) {
                if (bScore.overallScore > aScore.overallScore)
                    improvedTasks.push(taskId);
                if (bScore.overallScore < aScore.overallScore)
                    regressedTasks.push(taskId);
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
    evaluateSuccess(task, trajectory) {
        if (trajectory.steps.some(s => s.error && s.type === 'check')) {
            return false;
        }
        if (task.maxCost && trajectory.totalCost > task.maxCost) {
            return false;
        }
        const lastResponse = trajectory.steps.filter(s => s.type === 'response').pop();
        if (!lastResponse)
            return false;
        return true;
    }
    evaluateQuality(_task, trajectory) {
        let score = 0.5;
        if (trajectory.steps.some(s => s.type === 'patch'))
            score += 0.15;
        if (trajectory.steps.some(s => s.type === 'check' && !s.error))
            score += 0.15;
        const toolCalls = trajectory.steps.filter(s => s.type === 'tool_call').length;
        if (toolCalls > 0 && toolCalls < 20)
            score += 0.1;
        const errors = trajectory.steps.filter(s => s.error).length;
        if (errors === 0)
            score += 0.1;
        return Math.min(1, score);
    }
    evaluateCost(task, trajectory) {
        const maxCost = task.maxCost ?? 5.0;
        if (trajectory.totalCost === 0)
            return 1;
        return Math.max(0, 1 - (trajectory.totalCost / maxCost));
    }
    evaluateLatency(_task, trajectory) {
        const maxDuration = 300_000; // 5 minutes
        if (trajectory.duration === 0)
            return 1;
        return Math.max(0, 1 - (trajectory.duration / maxDuration));
    }
    classifyFailure(_task, trajectory) {
        const errors = trajectory.steps.filter(s => s.error);
        for (const error of errors) {
            const msg = error.error?.toLowerCase() ?? '';
            if (msg.includes('permission') || msg.includes('denied'))
                return 'permission';
            if (msg.includes('cost') || msg.includes('budget'))
                return 'cost_exceeded';
            if (msg.includes('handoff'))
                return 'handoff_error';
            if (msg.includes('test') || msg.includes('assertion'))
                return 'test_interpretation';
            if (msg.includes('patch') || msg.includes('diff') || msg.includes('apply'))
                return 'patching';
            if (msg.includes('tool') || msg.includes('command'))
                return 'tool';
        }
        const patches = trajectory.steps.filter(s => s.type === 'patch');
        if (patches.length === 0)
            return 'planning';
        return 'unknown';
    }
    estimateCostSavings(tasks) {
        // Estimate cost savings vs frontier-only baseline
        // If cheap model was used for most work, savings are ~40-60%
        // For now return a placeholder based on success rate
        const avgCost = tasks.reduce((sum, t) => sum + t.costScore, 0) / Math.max(1, tasks.length);
        return Math.round(avgCost * 50); // rough estimate
    }
}
exports.EvalHarness = EvalHarness;
//# sourceMappingURL=eval-harness.js.map