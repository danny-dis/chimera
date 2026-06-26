"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionExecutor = void 0;
/**
 * Multi-model deliberation (Fusion mode).
 * Parallel panel of models generates answers, then a judge synthesizes.
 */
class FusionExecutor {
    eventStream;
    registry;
    costTracker;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
    }
    async execute(task, config, providerFactory, context = { depth: 0 }) {
        const result = await this.executeWithAnalysis(task, config, providerFactory, context);
        return result.output;
    }
    async executeWithAnalysis(task, config, providerFactory, context = { depth: 0 }) {
        const startTime = Date.now();
        let totalTokens = 0;
        let totalCostUsd = 0;
        const panelResults = [];
        // ── Recursion guard ───────────────────────────────────────────────
        const maxDepth = config.maxDepth ?? 1;
        if (context.depth >= maxDepth) {
            return this.degraded('recursion limit reached', totalTokens, totalCostUsd, startTime);
        }
        // Resolve Panel Models ──────────────────────────────────────────
        let models = config.analysisModels ?? [];
        // If user provided panelSize (N) but no models, auto-select
        if (models.length === 0 && config.panelSize) {
            const n = config.panelSize;
            const allModelsMap = this.registry.models;
            const allModels = allModelsMap instanceof Map ? Array.from(allModelsMap.values()) : (Array.isArray(allModelsMap) ? allModelsMap : []);
            let available = allModels.filter((m) => !m.deprecated);
            if (config.preferLocal) {
                const localModels = available.filter((m) => m.provider === 'local');
                const otherModels = available.filter((m) => m.provider !== 'local');
                // Prioritize local models, then fill with others
                available = [...localModels, ...otherModels];
            }
            else {
                // Default: pick top cheap/mid models
                available = available.filter((m) => m.tier === 'cheap' || m.tier === 'mid');
            }
            models = available.slice(0, n).map((m) => m.id);
        }
        if (models.length === 0) {
            return this.degraded('no panel models available', totalTokens, totalCostUsd, startTime);
        }
        this.safeEmit({ type: 'fusion_started', task, models, judge: config.judgeModel });
        // ── Parallel Panel Calls ──────────────────────────────────────────
        const panelSettled = await Promise.allSettled(models.map(async (modelId, index) => {
            const start = Date.now();
            const provider = providerFactory(modelId);
            let finalTask = task;
            if (config.diversePerspectives) {
                const perspectives = [
                    'Focus specifically on security vulnerabilities and robustness.',
                    'Focus specifically on performance, efficiency, and resource usage.',
                    'Focus specifically on readability, maintainability, and clean code principles.',
                    'Focus specifically on edge cases, error handling, and boundary conditions.',
                    'Focus specifically on architectural alignment and design patterns.',
                ];
                const perspective = perspectives[index % perspectives.length];
                finalTask = `PERSPECTIVE: ${perspective}\n\nTASK: ${task}`;
            }
            const res = await provider.complete([{ role: 'user', content: finalTask }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
            return {
                modelId,
                content: res.content,
                inputTokens: res.usage?.inputTokens ?? 0,
                outputTokens: res.usage?.outputTokens ?? 0,
                durationMs: Date.now() - start,
            };
        }));
        for (const res of panelSettled) {
            if (res.status === 'fulfilled') {
                const v = res.value;
                panelResults.push(v);
                totalTokens += v.inputTokens + v.outputTokens;
                const cost = this.computeCost(v.modelId, v.inputTokens, v.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(v.modelId, cost);
            }
            else {
                this.safeEmit({ type: 'fusion_provider_error', modelId: 'unknown', error: String(res.reason) });
            }
        }
        if (panelResults.length === 0) {
            return this.degraded('all panel models failed', totalTokens, totalCostUsd, startTime);
        }
        // ── Optional Adversarial Round ────────────────────────────────────
        if (config.adversarialRound) {
            const round1Summary = panelResults.map(r => `--- ${r.modelId} ---\n${r.content}`).join('\n\n');
            const adversarialSettled = await Promise.allSettled(models.map(async (modelId) => {
                const prevResult = panelResults.find(r => r.modelId === modelId);
                if (!prevResult)
                    return null; // Should not happen
                const start = Date.now();
                const provider = providerFactory(modelId);
                const rebuttalPrompt = [
                    'You are participating in a multi-model debate.',
                    'Your initial answer:',
                    prevResult.content,
                    '',
                    'Here are the answers from other models in the panel:',
                    round1Summary,
                    '',
                    'Review the other perspectives and provide your final refined answer. Address any contradictions or improvements identified.',
                    'TASK:',
                    task,
                    '',
                    'FINAL ANSWER:'
                ].join('\n');
                const res = await provider.complete([{ role: 'user', content: rebuttalPrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
                return {
                    modelId,
                    content: res.content,
                    inputTokens: res.usage?.inputTokens ?? 0,
                    outputTokens: res.usage?.outputTokens ?? 0,
                    durationMs: Date.now() - start,
                };
            }));
            for (const res of adversarialSettled) {
                if (res.status === 'fulfilled' && res.value) {
                    const v = res.value;
                    // Update the panelResults with refined content
                    const idx = panelResults.findIndex(r => r.modelId === v.modelId);
                    if (idx !== -1) {
                        panelResults[idx] = v;
                    }
                    totalTokens += v.inputTokens + v.outputTokens;
                    const cost = this.computeCost(v.modelId, v.inputTokens, v.outputTokens);
                    totalCostUsd += cost;
                    this.recordSpend(v.modelId, cost);
                }
            }
        }
        // ── Judge Step ────────────────────────────────────────────────────
        const judgeStart = Date.now();
        let analysis;
        try {
            const judgeProvider = providerFactory(config.judgeModel);
            const prompt = this.buildJudgePrompt(task, panelResults);
            const judgeRes = await judgeProvider.complete([{ role: 'user', content: prompt }], { responseFormat: 'json_object', temperature: config.temperature, maxTokens: config.maxCompletionTokens });
            const parsed = JSON.parse(judgeRes.content);
            analysis = {
                thought: parsed.thought ?? '',
                finalResponse: parsed.finalResponse ?? judgeRes.content,
                consensus: parsed.consensus ?? [],
                conflicts: parsed.conflicts ?? [],
                uniqueInsights: parsed.uniqueInsights ?? [],
                blindSpots: parsed.blindSpots ?? [],
                confidence: parsed.confidence ?? 0.8,
            };
            totalTokens += (judgeRes.usage?.inputTokens ?? 0) + (judgeRes.usage?.outputTokens ?? 0);
            const cost = this.computeCost(config.judgeModel, judgeRes.usage?.inputTokens ?? 0, judgeRes.usage?.outputTokens ?? 0);
            totalCostUsd += cost;
            this.recordSpend(config.judgeModel, cost);
        }
        catch (err) {
            return this.degraded(`judge failed: ${String(err)}`, totalTokens, totalCostUsd, startTime);
        }
        this.safeEmit({ type: 'fusion_completed', task, durationMs: Date.now() - startTime, totalCostUsd });
        return {
            output: analysis.finalResponse,
            analysis,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: false,
        };
    }
    buildJudgePrompt(task, results) {
        return [
            'You are the judge in a multi-model fusion process.',
            'Task:',
            task,
            '',
            'Panel Responses:',
            ...results.map((r) => `--- Model: ${r.modelId} ---\n${r.content}\n`),
            '',
            'Provide a structured analysis in JSON:',
            '{',
            '  "thought": "your reasoning",',
            '  "finalResponse": "the best synthesized answer",',
            '  "consensus": ["points of agreement"],',
            '  "conflicts": ["points of disagreement"],',
            '  "uniqueInsights": ["novel ideas from specific models"],',
            '  "blindSpots": ["potential errors or gaps"],',
            '  "confidence": 0.0-1.0',
            '}'
        ].join('\n');
    }
    computeCost(modelId, inputTokens, outputTokens) {
        const entry = this.lookupModel(modelId);
        if (!entry)
            return 0;
        return (inputTokens / 1_000_000) * entry.pricing.inputPerMillion + (outputTokens / 1_000_000) * entry.pricing.outputPerMillion;
    }
    lookupModel(modelId) {
        const reg = this.registry;
        if (typeof reg.get === 'function')
            return reg.get(modelId) ?? null;
        if (Array.isArray(reg.models))
            return reg.models.find((m) => m.id === modelId) ?? null;
        return null;
    }
    recordSpend(modelId, costUsd) {
        if (this.costTracker && costUsd > 0)
            this.costTracker.recordSpend(modelId, costUsd);
    }
    isOverBudget(config, currentCost) {
        return config.budgetUsd !== undefined && config.budgetUsd > 0 && currentCost > config.budgetUsd;
    }
    safeEmit(event) {
        try {
            this.eventStream.append(event);
        }
        catch { /* ignore */ }
    }
    degraded(reason, totalTokens, totalCostUsd, startTime) {
        return {
            output: '',
            analysis: {},
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: true,
            degradationReason: reason,
        };
    }
}
exports.FusionExecutor = FusionExecutor;
//# sourceMappingURL=fusion-executor.js.map