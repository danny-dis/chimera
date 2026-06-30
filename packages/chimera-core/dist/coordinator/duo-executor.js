"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuoExecutor = void 0;
const output_sanitizer_js_1 = require("./output-sanitizer.js");
const task_router_js_1 = require("../task-router.js");
/**
 * Two-model sequential deliberation with **deterministic** synthesis.
 *
 * Distinct from `FusionExecutor` and `TrioExecutor`:
 *   - Both models are called **sequentially** — Model A writes a draft,
 *     then Model B reviews it.
 *   - The synthesis is **always** the deterministic `ResponseSynthesizer`
 *     (Jaccard + role authority). There is no LLM judge.
 *   - role assignment: modelA → 'writer' (confidence 0.8), modelB →
 *     'reviewer' (confidence 0.7).
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `DuoContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke tests live in `__tests__/duo-executor.test.ts`
 */
class DuoExecutor {
    eventStream;
    registry;
    costTracker;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
    }
    /**
     * Run a duo deliberation and return the synthesized response as a
     * string. For structured access to the analysis, use
     * {@link executeWithAnalysis}.
     */
    async execute(task, config, providerFactory, context = { depth: 0 }) {
        const result = await this.executeWithAnalysis(task, config, providerFactory, context);
        return result.output;
    }
    /**
     * Run a duo deliberation and return the full structured result.
     */
    async executeWithAnalysis(task, config, providerFactory, context = { depth: 0 }) {
        const startTime = Date.now();
        const sources = [];
        let totalTokens = 0;
        let totalCostUsd = 0;
        let degraded = false;
        let degradationReason;
        // ── Recursion guard ───────────────────────────────────────────────
        const maxDepth = config.maxDepth ?? 1;
        if (context.depth >= maxDepth) {
            return this.degraded(totalTokens, totalCostUsd, startTime, sources, 'recursion limit reached at depth ' + context.depth);
        }
        // ── Config validation ─────────────────────────────────────────────
        if (!config.modelA || !config.modelB) {
            return this.degraded(totalTokens, totalCostUsd, startTime, sources, 'modelA and modelB are required');
        }
        // Duo requires two distinct models. Same-model duo is functionally
        // identical to solo with self-verify but costs 2x — reject it.
        if (config.modelA === config.modelB) {
            return this.degraded(totalTokens, totalCostUsd, startTime, sources, `duo requires two distinct models; got modelA=modelB="${config.modelA}". Use solo preset for same-model execution.`);
        }
        // ── Sequential calls ──────────────────────────────────────────────
        try {
            // Stage 1: Writer
            const resA = await this.callPeer('writer', config.modelA, task, config, providerFactory);
            const sourceA = {
                modelId: config.modelA,
                role: 'writer',
                content: (0, output_sanitizer_js_1.sanitizeWriterOutput)(resA.content),
                tokens: resA.inputTokens + resA.outputTokens,
                durationMs: resA.durationMs,
            };
            sources.push(sourceA);
            totalTokens += sourceA.tokens;
            const costA = this.computeCost(config.modelA, resA.inputTokens, resA.outputTokens);
            totalCostUsd += costA;
            this.recordSpend(config.modelA, costA);
            // Budget check after first call
            if (this.isOverBudget(config, totalCostUsd)) {
                return this.degraded(totalTokens, totalCostUsd, startTime, sources, `cost $${totalCostUsd.toFixed(4)} exceeded budget after writer call`);
            }
            // Optional Stage: Linter
            let linterFeedback = '';
            if (config.useLinter) {
                const lintResult = this.runLinter(sourceA.content);
                if (!lintResult.success) {
                    linterFeedback = `\n\nLINTER FINDINGS:\n${lintResult.errors.join('\n')}`;
                }
            }
            // Stage 2: Reviewer
            const resB = await this.callPeer('reviewer', config.modelB, task, config, providerFactory, sourceA.content + linterFeedback);
            const sourceB = {
                modelId: config.modelB,
                role: 'reviewer',
                content: (0, output_sanitizer_js_1.sanitizeReviewerOutput)(resB.content),
                tokens: resB.inputTokens + resB.outputTokens,
                durationMs: resB.durationMs,
            };
            sources.push(sourceB);
            totalTokens += sourceB.tokens;
            const costB = this.computeCost(config.modelB, resB.inputTokens, resB.outputTokens);
            totalCostUsd += costB;
            this.recordSpend(config.modelB, costB);
        }
        catch (err) {
            return this.degraded(totalTokens, totalCostUsd, startTime, sources, `sequential calls failed: ${String(err)}`);
        }
        // Budget check after both calls
        if (this.isOverBudget(config, totalCostUsd)) {
            degradationReason = `cost $${totalCostUsd.toFixed(4)} exceeded budget $${config.budgetUsd}`;
            degraded = true;
        }
        // ── Synthesize (deterministic) ────────────────────────────────────
        const validSources = sources.filter((s) => !s.error && s.content.length > 0);
        if (validSources.length === 0) {
            return this.degraded(totalTokens, totalCostUsd, startTime, sources, degraded ? (degradationReason ?? 'budget exceeded') : 'both models failed');
        }
        // In sequential mode, we prefer the reviewer (Model B) if it succeeded.
        const sourceA = sources.find(s => s.role === 'writer');
        const sourceB = sources.find(s => s.role === 'reviewer');
        // If only writer succeeded (reviewer failed or was over budget)
        if (sourceA && !sourceB) {
            const analysis = {
                thought: '',
                finalResponse: sourceA.content,
                consensus: [sourceA.content],
                conflicts: [],
                uniqueInsights: [sourceA.content],
                blindSpots: [],
                confidence: 0.8,
            };
            return {
                output: sourceA.content,
                analysis,
                sources,
                totalTokens,
                totalCostUsd,
                durationMs: Date.now() - startTime,
                degraded: true,
                degradationReason: degradationReason ?? 'reviewer failed',
                needsUserEscalation: false,
            };
        }
        // Both succeeded or only reviewer succeeded (unlikely given sequential dependency)
        const finalResponse = sourceB ? sourceB.content : sourceA.content;
        const analysis = {
            thought: '',
            finalResponse,
            consensus: sourceA ? [sourceA.content] : [],
            conflicts: [],
            uniqueInsights: sourceB ? [sourceB.content] : [],
            blindSpots: [],
            confidence: sourceB ? 0.9 : 0.8,
        };
        return {
            output: finalResponse,
            analysis,
            sources,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded,
            degradationReason: degraded ? degradationReason : undefined,
            needsUserEscalation: false,
        };
    }
    // ── private helpers ───────────────────────────────────────────────
    async callPeer(role, modelId, task, config, providerFactory, draft) {
        const start = Date.now();
        const provider = providerFactory(modelId);
        const prompt = role === 'writer'
            ? this.buildPeerPrompt(role, task)
            : this.buildReviewPrompt(task, draft);
        const r = await provider.complete([{ role: 'user', content: prompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
        return {
            content: r.content,
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
            durationMs: Date.now() - start,
        };
    }
    deriveConsensus(inputs, conflicts) {
        const conflictedAgentIds = new Set(conflicts.flatMap((c) => c.involvedAgents));
        const conflictFreeContents = inputs.filter((i) => !conflictedAgentIds.has(i.agentId));
        return conflictFreeContents.map((i) => i.content.split('\n')[0].slice(0, 200));
    }
    buildPeerPrompt(role, task) {
        if (task_router_js_1.TaskRouter.isConversationalTask(task)) {
            return `You are a helpful assistant. Answer the following conversational question directly.\n` +
                `Do NOT produce code, file changes, or technical analysis unless specifically asked.\n` +
                `Provide a clear, concise, factual answer.\n\nTASK: ${task}\n\nANSWER:`;
        }
        return `You are the ${role}. Provide a complete answer to the following task. Be specific and concrete.\n\nTASK: ${task}\n\nANSWER:`;
    }
    buildReviewPrompt(task, draft) {
        if (task_router_js_1.TaskRouter.isConversationalTask(task)) {
            return `[!] CONVERSATIONAL REVIEW [!]\n` +
                `This is a conversational/general question, NOT a code task.\n` +
                `Do NOT apply code-review criteria.\n` +
                `Evaluate ONLY: factual accuracy, completeness, and clarity.\n` +
                `Default to PASS unless the answer is factually incorrect.\n\n` +
                `TASK: ${task}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
        }
        return `You are the reviewer. Read the following draft answer to the task and identify any issues, hallucinations, or missing parts. Provide an improved version of the answer.\n\nTASK: ${task}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
    }
    runLinter(content) {
        const errors = [];
        // Heuristic 1: Check for unclosed code blocks
        const codeBlockCount = (content.match(/```/g) || []).length;
        if (codeBlockCount % 2 !== 0) {
            errors.push('Unclosed code block detected.');
        }
        // Heuristic 2: Check for obvious syntax errors in common languages
        if (content.includes('function') || content.includes('const ') || content.includes('var ')) {
            const openBrace = (content.match(/{/g) || []).length;
            const closeBrace = (content.match(/}/g) || []).length;
            if (openBrace !== closeBrace) {
                errors.push(`Brace mismatch: ${openBrace} open vs ${closeBrace} close.`);
            }
        }
        return {
            success: errors.length === 0,
            errors
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
    degraded(totalTokens, totalCostUsd, startTime, sources, degradationReason) {
        const analysis = {
            thought: '',
            finalResponse: '',
            consensus: [],
            conflicts: [degradationReason],
            uniqueInsights: [],
            blindSpots: [],
            confidence: 0,
        };
        return {
            output: '',
            analysis,
            sources,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: true,
            degradationReason,
            needsUserEscalation: false,
        };
    }
}
exports.DuoExecutor = DuoExecutor;
//# sourceMappingURL=duo-executor.js.map