"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecursiveDispatcher = void 0;
const DEFAULT_RECURSIVE = {
    maxDepth: 2,
    confidenceThreshold: 0.6,
    budgetUsd: 0.5,
};
class RecursiveDispatcher {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_RECURSIVE, ...config };
    }
    shouldRetry(analysis, depth, spentUsd) {
        if (depth >= this.config.maxDepth)
            return false;
        if (spentUsd >= this.config.budgetUsd)
            return false;
        const lowConfidence = analysis.confidence < this.config.confidenceThreshold;
        const hasBlindSpots = analysis.blindSpots.length > 0;
        const hasContradictions = analysis.conflicts.some((c) => c.type === 'contradiction');
        return lowConfidence || (hasBlindSpots && hasContradictions);
    }
    identifyWeakSubtasks(results, analysis) {
        const weak = new Set();
        for (const conflict of analysis.conflicts) {
            if (conflict.type === 'contradiction') {
                for (const id of conflict.subTaskIds)
                    weak.add(id);
            }
        }
        if (analysis.blindSpots.length > 0 && results.length > 1) {
            const last = results[results.length - 1];
            if (last)
                weak.add(last.subTaskId);
        }
        return Array.from(weak);
    }
    async reDispatch(weakIds, originalResults, routingDecisions, providers, originalTask) {
        const redos = [];
        for (const id of weakIds) {
            const orig = originalResults.find((r) => r.subTaskId === id);
            if (!orig)
                continue;
            const decision = routingDecisions.get(id);
            const currentModel = decision?.selectedModel ?? orig.assignedModel;
            const altModel = this.pickAlternativeModel(currentModel ?? '', providers);
            if (!altModel)
                continue;
            const provider = providers.get(altModel);
            if (!provider)
                continue;
            const start = Date.now();
            try {
                const result = await provider.complete([{ role: 'user', content: `${originalTask}\n\nRe-examine this specifically:\n${orig.output}` }], { temperature: 0.3 });
                redos.push({
                    subTaskId: `${id}-retry`,
                    status: 'success',
                    output: result.content,
                    tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
                    assignedModel: altModel,
                    durationMs: Date.now() - start,
                });
            }
            catch (e) {
                redos.push({
                    subTaskId: `${id}-retry`,
                    status: 'error',
                    output: '',
                    tokensUsed: 0,
                    assignedModel: altModel,
                    error: String(e),
                    durationMs: Date.now() - start,
                });
            }
        }
        return redos;
    }
    pickAlternativeModel(currentModel, providers) {
        const available = Array.from(providers.keys()).filter((m) => m !== currentModel);
        return available[0];
    }
}
exports.RecursiveDispatcher = RecursiveDispatcher;
//# sourceMappingURL=recursive-dispatcher.js.map