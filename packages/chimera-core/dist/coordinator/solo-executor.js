"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoloExecutor = void 0;
/**
 * The simplest executor: one model answers one prompt.
 *
 * It supports two sub-modes:
 *   1. Direct (selfVerify=false): One LLM call.
 *   2. Self-Correction (selfVerify=true): Two sequential LLM calls
 *      (Writer -> Reviewer) using the same model.
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `SoloContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke tests live in `__tests__/`
 */
class SoloExecutor {
    eventStream;
    registry;
    costTracker;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
    }
    /**
     * Run a solo execution and return the final response as a string.
     * For structured access to the analysis, use {@link executeWithAnalysis}.
     */
    async execute(task, config, providerFactory, context = { depth: 0 }) {
        const result = await this.executeWithAnalysis(task, config, providerFactory, context);
        return result.output;
    }
    /**
     * Run a solo execution and return the full structured result.
     */
    async executeWithAnalysis(task, config, providerFactory, context = { depth: 0 }) {
        const startTime = Date.now();
        let totalTokens = 0;
        let totalCostUsd = 0;
        const selfVerify = config.selfVerify ?? true;
        // ── Recursion guard ───────────────────────────────────────────────
        const maxDepth = config.maxDepth ?? 1;
        if (context.depth >= maxDepth) {
            return this.degraded('recursion limit reached at depth ' + context.depth, totalTokens, totalCostUsd, startTime);
        }
        // ── Config validation ─────────────────────────────────────────────
        if (!config.model) {
            return this.degraded('model is required', totalTokens, totalCostUsd, startTime);
        }
        // ── Stage 1: Draft ────────────────────────────────────────────────
        let draftContent;
        let thought = '';
        // Eternal CoT: Explicit thinking turn
        if (config.eternalCoT) {
            try {
                const res = await this.callPeer('thinker', config.model, task, config, providerFactory);
                thought = res.content;
                totalTokens += res.inputTokens + res.outputTokens;
                const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(config.model, cost);
                // Budget check after thought
                if (this.isOverBudget(config, totalCostUsd)) {
                    return this.degraded(`thought cost $${totalCostUsd.toFixed(4)} exceeded budget`, totalTokens, totalCostUsd, startTime);
                }
            }
            catch (err) {
                return this.degraded(`thought call failed: ${String(err)}`, totalTokens, totalCostUsd, startTime);
            }
        }
        try {
            const res = await this.callPeer('writer', config.model, task, config, providerFactory, undefined, thought);
            draftContent = res.content;
            totalTokens += res.inputTokens + res.outputTokens;
            const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
            totalCostUsd += cost;
            this.recordSpend(config.model, cost);
        }
        catch (err) {
            return this.degraded(`draft call failed: ${String(err)}`, totalTokens, totalCostUsd, startTime);
        }
        if (!selfVerify) {
            return this.finalizeSolo(draftContent, totalTokens, totalCostUsd, startTime, 1, thought);
        }
        // Budget check after draft
        if (this.isOverBudget(config, totalCostUsd)) {
            return this.degraded(`draft cost $${totalCostUsd.toFixed(4)} exceeded budget`, totalTokens, totalCostUsd, startTime, draftContent);
        }
        // ── Stage 2: Self-Verification ────────────────────────────────────
        let reviewContent;
        try {
            const res = await this.callPeer('reviewer', config.model, task, config, providerFactory, draftContent);
            reviewContent = res.content;
            totalTokens += res.inputTokens + res.outputTokens;
            const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
            totalCostUsd += cost;
            this.recordSpend(config.model, cost);
        }
        catch (err) {
            // If verification fails, return the draft as degraded
            return this.degraded(`verification call failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, draftContent);
        }
        // ── Synthesis ─────────────────────────────────────────────────────
        // For Solo mode, we treat the 'reviewer' as the improved version.
        // We return it directly as the output, while keeping the 5-field
        // analysis for consistency.
        const finalResponse = reviewContent;
        const analysis = {
            thought,
            finalResponse,
            consensus: [draftContent],
            conflicts: [],
            uniqueInsights: [reviewContent],
            blindSpots: [],
            confidence: 0.9, // Higher confidence after self-correction
        };
        this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount: config.eternalCoT ? 3 : 2 });
        return {
            output: finalResponse,
            analysis,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: false,
        };
    }
    // ── private helpers ───────────────────────────────────────────────
    async callPeer(role, modelId, task, config, providerFactory, draft, thought) {
        const start = Date.now();
        const provider = providerFactory(modelId);
        let prompt;
        switch (role) {
            case 'thinker':
                prompt = this.buildThinkPrompt(task);
                break;
            case 'writer':
                prompt = this.buildDraftPrompt(task, thought);
                break;
            case 'reviewer':
                prompt = this.buildReviewPrompt(task, draft);
                break;
        }
        const r = await provider.complete([{ role: 'user', content: prompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
        return {
            content: r.content,
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
            durationMs: Date.now() - start,
        };
    }
    buildThinkPrompt(task) {
        return `You are a strategic thinker. Analyze the following task and plan your approach. Identify potential pitfalls and best practices. Do not provide the final answer yet, just your reasoning process.\n\nTASK: ${task}\n\nTHOUGHT:`;
    }
    buildDraftPrompt(task, thought) {
        const thoughtPrefix = thought ? `STRATEGIC PLAN:\n${thought}\n\n` : '';
        return `You are the writer. Provide a complete answer to the following task. ${thought ? 'Follow the strategic plan provided.' : 'Be specific and concrete.'}\n\n${thoughtPrefix}TASK: ${task}\n\nANSWER:`;
    }
    buildReviewPrompt(task, draft) {
        return `You are the reviewer. Read the following draft answer to the task and identify any issues, hallucinations, or missing parts. Provide an improved version of the answer.\n\nTASK: ${task}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
    }
    finalizeSolo(output, totalTokens, totalCostUsd, startTime, agentCount, thought = '') {
        const analysis = {
            thought,
            finalResponse: output,
            consensus: [],
            conflicts: [],
            uniqueInsights: [],
            blindSpots: [],
            confidence: 0.8,
        };
        this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount });
        return {
            output,
            analysis,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: false,
        };
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
        catch { /* schema mismatch — ignore */ }
    }
    degraded(reason, totalTokens, totalCostUsd, startTime, output = '') {
        this.safeEmit({ type: 'final_response', status: 'needs_user', cost: totalCostUsd, agentCount: 1 });
        return {
            output,
            analysis: { finalResponse: output },
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: true,
            degradationReason: reason,
        };
    }
}
exports.SoloExecutor = SoloExecutor;
//# sourceMappingURL=solo-executor.js.map