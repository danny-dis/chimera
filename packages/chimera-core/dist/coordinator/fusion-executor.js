"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionExecutor = void 0;
const output_sanitizer_js_1 = require("./output-sanitizer.js");
const agent_tool_loop_js_1 = require("./agent-tool-loop.js");
const file_write_fallback_js_1 = require("./file-write-fallback.js");
const path_from_task_js_1 = require("./path-from-task.js");
/**
 * Extract a JSON object from model output that may be wrapped in markdown
 * fences (```json ... ```) and/or preceded by prose. Falls back to locating
 * the first balanced `{...}` block. Throws if no valid JSON object is found.
 */
function extractJsonObject(raw) {
    if (!raw)
        throw new Error('empty content');
    const candidates = [];
    // 1) Whole-string parse.
    candidates.push(raw.trim());
    // 2) Strip a ```json / ``` fenced block.
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence)
        candidates.push(fence[1].trim());
    // 3) Every balanced {...} substring (handles multiple blocks / prose).
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== '{')
            continue;
        let depth = 0;
        let inStr = false;
        let esc = false;
        for (let j = i; j < raw.length; j++) {
            const ch = raw[j];
            if (inStr) {
                if (esc)
                    esc = false;
                else if (ch === '\\')
                    esc = true;
                else if (ch === '"')
                    inStr = false;
            }
            else if (ch === '"')
                inStr = true;
            else if (ch === '{')
                depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    candidates.push(raw.slice(i, j + 1));
                    break;
                }
            }
        }
    }
    for (const c of candidates) {
        try {
            const parsed = JSON.parse(c);
            if (typeof parsed === 'object' && parsed !== null)
                return parsed;
        }
        catch {
            /* try next candidate */
        }
    }
    throw new Error('no JSON object found');
}
function expectedPathFromTask(task) {
    const m = task.match(/\b([A-Za-z0-9_\-./]+\.(?:rs|ts|js|jsx|tsx|py|toml|json|md|ya?ml|go|java|cpp|c|rb|php|txt|html|css|sh))\b/);
    return m ? m[1] : undefined;
}
/**
 * Multi-model deliberation (Fusion mode).
 * Parallel panel of models generates answers, then a judge synthesizes.
 */
class FusionExecutor {
    eventStream;
    registry;
    costTracker;
    toolExecutor;
    toolRegistry;
    workspaceRoot;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
        this.toolExecutor = deps.toolExecutor;
        this.toolRegistry = deps.toolRegistry;
        this.workspaceRoot = deps.workspaceRoot;
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
            this.safeEmit({ type: 'fusion_recursion_blocked', depth: context.depth, maxDepth });
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
            const toolDefs = this.toolRegistry
                ? this.toolRegistry.getAll().map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters ?? {},
                }))
                : undefined;
            const res = await provider.complete([{ role: 'user', content: finalTask }], {
                temperature: config.temperature,
                maxTokens: config.maxCompletionTokens,
                ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}),
                ...(this.toolExecutor && this.workspaceRoot && toolDefs ? { tools: toolDefs } : {}),
            });
            // Writer-panel path: route through the shared agentic tool loop so the
            // panel agent actually calls write_file instead of narrating the file in
            // prose. Falls back to the bare draft when tooling is unavailable
            // (non-file tasks, or deps not wired).
            let content = res.content;
            let extraInput = res.usage?.inputTokens ?? 0;
            let extraOutput = res.usage?.outputTokens ?? 0;
            if (this.toolExecutor && this.toolRegistry && this.workspaceRoot) {
                const wantsFiles = (0, path_from_task_js_1.taskWantsFiles)(task);
                try {
                    const loop = await (0, agent_tool_loop_js_1.runAgentToolLoop)({
                        provider,
                        messages: [{ role: 'user', content: finalTask }],
                        options: { temperature: config.temperature, maxTokens: config.maxCompletionTokens },
                        toolExecutor: this.toolExecutor,
                        toolRegistry: this.toolRegistry,
                        eventStream: this.eventStream,
                        workspaceRoot: this.workspaceRoot,
                        sessionId: `fusion-${modelId}`,
                        initialContent: res.content,
                        initialToolCalls: res.toolCalls ?? [],
                        maxRounds: Math.max(1, config.maxDepth ?? 4),
                        mode: 'solo',
                        forceMinFiles: 1,
                        wantsFiles,
                        task,
                        toolDefs,
                        sanitize: output_sanitizer_js_1.sanitizeWriterOutput,
                    });
                    content = loop.content || res.content;
                    extraInput = (res.usage?.inputTokens ?? 0) + loop.inputTokens;
                    extraOutput = (res.usage?.outputTokens ?? 0) + loop.outputTokens;
                    // Prose fallback: if still no file landed, parse the narration and
                    // execute it for real (mirrors solo/duo).
                    if (wantsFiles && loop.wroteFileCount < 1) {
                        try {
                            const proseFiles = await (0, file_write_fallback_js_1.executeProseActions)(content, {
                                eventStream: this.eventStream,
                                toolExecutor: this.toolExecutor,
                                toolRegistry: this.toolRegistry,
                                workspaceRoot: this.workspaceRoot,
                                sessionId: `fusion-${modelId}`,
                                expectedPath: expectedPathFromTask(task),
                            });
                            if (proseFiles > 0)
                                content = content || 'Task executed via tools.';
                        }
                        catch {
                            /* best-effort */
                        }
                    }
                }
                catch {
                    // Tool loop failed — fall through to the bare draft below.
                }
            }
            return {
                modelId,
                content,
                inputTokens: extraInput,
                outputTokens: extraOutput,
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
                const errStr = String(res.reason);
                this.safeEmit({ type: 'fusion_provider_error', modelId: 'unknown', error: errStr });
                panelResults.push({ modelId: 'unknown', content: '', inputTokens: 0, outputTokens: 0, durationMs: 0, error: errStr });
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
                const res = await provider.complete([{ role: 'user', content: rebuttalPrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
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
        // ── Budget enforcement (after panel calls, before judge) ──────────
        if (config.budgetUsd !== undefined) {
            const currentCost = this.costTracker?.getTotalCost() ?? 0;
            if (currentCost >= config.budgetUsd) {
                this.safeEmit({ type: 'fusion_budget_exceeded', currentCost, budget: config.budgetUsd });
                return this.degraded('budget exceeded', totalTokens, totalCostUsd, startTime);
            }
        }
        // ── Judge Step (with failover chain) ──────────────────────────────
        const judgeStart = Date.now();
        let analysis;
        const judgeModels = [config.judgeModel, ...(config.judgeFailover ?? [])];
        const prompt = this.buildJudgePrompt(task, panelResults);
        for (const judgeModel of judgeModels) {
            try {
                const judgeProvider = providerFactory(judgeModel);
                const judgeRes = await judgeProvider.complete([{ role: 'user', content: prompt }], { responseFormat: 'json_object', temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                let parsed = null;
                try {
                    parsed = extractJsonObject(judgeRes.content);
                }
                catch {
                    // Judge returned prose/free text instead of JSON. Tolerate it: use
                    // the raw reply as the synthesized review rather than degrading the
                    // whole fusion run (the judge's prose is still a coherent verdict).
                    this.safeEmit({ type: 'fusion_judge_parse_error', raw: judgeRes.content });
                    parsed = null;
                }
                if (!parsed) {
                    analysis = {
                        thought: 'Judge returned non-JSON prose; using verbatim reply as the review.',
                        finalResponse: judgeRes.content.trim() || judgeRes.content,
                        consensus: [],
                        conflicts: [],
                        uniqueInsights: [],
                        blindSpots: [],
                        confidence: 0.6,
                    };
                    totalTokens += (judgeRes.usage?.inputTokens ?? 0) + (judgeRes.usage?.outputTokens ?? 0);
                    const cost = this.computeCost(judgeModel, judgeRes.usage?.inputTokens ?? 0, judgeRes.usage?.outputTokens ?? 0);
                    totalCostUsd += cost;
                    this.recordSpend(judgeModel, cost);
                    break;
                }
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
                const cost = this.computeCost(judgeModel, judgeRes.usage?.inputTokens ?? 0, judgeRes.usage?.outputTokens ?? 0);
                totalCostUsd += cost;
                this.recordSpend(judgeModel, cost);
                break;
            }
            catch (err) {
                this.safeEmit({ type: 'fusion_fallback_judge', failedModel: judgeModel, error: String(err) });
            }
        }
        if (!analysis) {
            return this.degraded('all judges failed', totalTokens, totalCostUsd, startTime);
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