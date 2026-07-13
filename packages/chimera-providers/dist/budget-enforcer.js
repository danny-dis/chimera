"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetEnforcer = void 0;
const zod_1 = require("zod");
const BudgetConfigSchema = zod_1.z.object({
    perTask: zod_1.z.number().positive(),
    perSession: zod_1.z.number().positive(),
    perDay: zod_1.z.number().positive(),
    alertThresholds: zod_1.z.array(zod_1.z.number().min(0).max(1)),
});
class BudgetEnforcer {
    costTracker;
    config;
    spentBySession = new Map();
    constructor(config, costTracker) {
        this.costTracker = costTracker;
        this.config = BudgetConfigSchema.parse(config);
    }
    // ponytail: cost tracker throws "Session not found" when the orchestrator
    // never startSession()'d this id (hive/fusion mid-flight cost calls). A
    // missing session = no spend recorded yet = cost 0, which is fail-safe
    // (0 <= budget => allow, never a false stop). Keeps the tracker's throw
    // contract intact for direct callers that rely on it.
    safeSessionCost(sessionId) {
        try {
            return this.costTracker.getSessionCost(sessionId);
        }
        catch {
            return 0;
        }
    }
    check(taskEstimate, sessionId) {
        const sessionCost = this.safeSessionCost(sessionId);
        const dayTotal = this.costTracker.getDayTotalAll();
        const taskResult = this.evaluate(taskEstimate, taskEstimate, this.config.perTask, 'task');
        const sessionResult = this.evaluate(sessionCost + taskEstimate, sessionCost + taskEstimate, this.config.perSession, 'session');
        const dayResult = this.evaluate(dayTotal + taskEstimate, dayTotal + taskEstimate, this.config.perDay, 'day');
        const worst = this.worstAction([taskResult, sessionResult, dayResult]);
        return worst;
    }
    recordSpend(sessionId, cost) {
        const current = this.spentBySession.get(sessionId) ?? 0;
        this.spentBySession.set(sessionId, current + cost);
    }
    updateConfig(config) {
        const merged = { ...this.config, ...config };
        this.config = BudgetConfigSchema.parse(merged);
    }
    getBudgetStatus(sessionId) {
        const sessionCost = this.safeSessionCost(sessionId);
        const dayTotal = this.costTracker.getDayTotalAll();
        const sessionSpent = this.spentBySession.get(sessionId) ?? 0;
        return {
            task: this.evaluate(0, 0, this.config.perTask, 'task'),
            session: this.evaluate(sessionCost + sessionSpent, sessionCost + sessionSpent, this.config.perSession, 'session'),
            day: this.evaluate(dayTotal, dayTotal, this.config.perDay, 'day'),
        };
    }
    evaluate(projectedCost, currentCost, budget, scope) {
        const percentage = budget > 0 ? projectedCost / budget : 0;
        if (percentage >= 1.0) {
            return {
                action: 'stop',
                reason: `${scope} budget exceeded: $${projectedCost.toFixed(4)} / $${budget.toFixed(2)} (${(percentage * 100).toFixed(1)}%)`,
                currentCost,
                budget,
                percentage,
            };
        }
        if (percentage >= 0.95) {
            return {
                action: 'throttle',
                reason: `${scope} budget at critical level: ${(percentage * 100).toFixed(1)}% used`,
                currentCost,
                budget,
                percentage,
            };
        }
        const triggeredThreshold = [...this.config.alertThresholds]
            .sort((a, b) => b - a)
            .find((t) => percentage >= t);
        if (triggeredThreshold !== undefined) {
            return {
                action: 'warn',
                reason: `${scope} budget at ${(percentage * 100).toFixed(1)}% (threshold: ${(triggeredThreshold * 100).toFixed(0)}%)`,
                currentCost,
                budget,
                percentage,
            };
        }
        return {
            action: 'allow',
            reason: `${scope} budget within limits: ${(percentage * 100).toFixed(1)}% used`,
            currentCost,
            budget,
            percentage,
        };
    }
    worstAction(results) {
        const priority = ['stop', 'throttle', 'warn', 'allow'];
        let worst = results[0];
        for (const result of results) {
            if (priority.indexOf(result.action) < priority.indexOf(worst.action)) {
                worst = result;
            }
        }
        return worst;
    }
}
exports.BudgetEnforcer = BudgetEnforcer;
//# sourceMappingURL=budget-enforcer.js.map