"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelComparator = void 0;
const cost_calculator_js_1 = require("./cost-calculator.js");
const TIER_QUALITY = {
    cheap: 3,
    mid: 6,
    frontier: 8,
    reasoning: 9,
};
class ModelComparator {
    registry;
    calculator;
    constructor(registry) {
        this.registry = registry;
        this.calculator = new cost_calculator_js_1.CostCalculator(registry);
    }
    compare(modelIds, estimatedInputTokens, estimatedOutputTokens) {
        const models = [];
        const costPerTask = new Map();
        const qualityScore = new Map();
        const costEfficiency = new Map();
        for (const id of modelIds) {
            const model = this.registry.get(id);
            if (!model)
                continue;
            models.push(model);
            const breakdown = this.calculator.calculate(id, {
                input: estimatedInputTokens,
                output: estimatedOutputTokens,
            });
            costPerTask.set(id, breakdown.totalCost);
            const quality = TIER_QUALITY[model.tier] ?? 5;
            qualityScore.set(id, quality);
            const efficiency = breakdown.totalCost > 0 ? quality / breakdown.totalCost : Infinity;
            costEfficiency.set(id, efficiency);
        }
        let recommendation = models[0]?.id ?? '';
        let bestEfficiency = -1;
        for (const [id, efficiency] of costEfficiency) {
            if (efficiency > bestEfficiency) {
                bestEfficiency = efficiency;
                recommendation = id;
            }
        }
        return {
            models,
            costPerTask,
            qualityScore,
            costEfficiency,
            recommendation,
        };
    }
    recommendForTask(taskComplexity, budget) {
        const allModels = this.registry.getAll().filter((m) => !m.deprecated);
        let bestId = '';
        let bestScore = -1;
        for (const model of allModels) {
            const quality = TIER_QUALITY[model.tier] ?? 5;
            if (quality < taskComplexity)
                continue;
            const breakdown = this.calculator.calculate(model.id, {
                input: 1000,
                output: 500,
            });
            if (breakdown.totalCost > budget)
                continue;
            const efficiency = breakdown.totalCost > 0 ? quality / breakdown.totalCost : Infinity;
            if (efficiency > bestScore) {
                bestScore = efficiency;
                bestId = model.id;
            }
        }
        return bestId;
    }
}
exports.ModelComparator = ModelComparator;
//# sourceMappingURL=model-comparator.js.map