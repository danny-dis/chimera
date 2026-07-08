"use strict";
/**
 * `DeliberationEngine` — single dispatch surface for the 5 deliberation
 * modes (solo, duo, trio, fusion, merge).
 *
 * The engine is a **thin facade**. It owns no new logic — each mode
 * delegates to the existing executor (`SoloExecutor`, `DuoExecutor`,
 * `TrioExecutor`, `FusionExecutor`, `ResultAggregator`) and normalizes
 * the result to the unified `DeliberationResult` shape.
 *
 * Determinism: the engine adds no new side effects. All events emitted
 * are produced by the underlying executors; the engine only routes and
 * normalizes. All 9 fusion safety-net patterns (defensive safeEmit,
 * factory injection, cost tracking, recursion guard, degraded fallback,
 * 5-field analysis shape, defensive usage access, test coverage) are
 * inherited from the executors themselves.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.presets = exports.DeliberationEngine = void 0;
const solo_executor_js_1 = require("../solo-executor.js");
const duo_executor_js_1 = require("../duo-executor.js");
const trio_executor_js_1 = require("../trio-executor.js");
const fusion_executor_js_1 = require("../fusion-executor.js");
const result_aggregator_js_1 = require("../result-aggregator.js");
const task_decomposer_js_1 = require("../task-decomposer.js");
const sub_agent_spawner_js_1 = require("../sub-agent-spawner.js");
const llm_router_js_1 = require("../llm-router.js");
const preset_router_js_1 = require("./preset-router.js");
const task_router_js_1 = require("../../task-router.js");
const prompts_js_1 = require("../../prompts.js");
class DeliberationEngine {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Dispatch on `config.mode` and return a normalized
     * `DeliberationResult`.
     */
    async run(config) {
        switch (config.mode) {
            case 'solo':
                return this.runSolo(config);
            case 'duo':
                return this.runDuo(config);
            case 'trio':
                return this.runTrio(config);
            case 'fusion':
                return this.runFusion(config);
            case 'merge':
                return this.runMerge(config);
            case 'hive':
                return this.runHive(config);
            case 'swarm':
                return this.runSwarm(config);
            case 'auto':
                return this.runAuto(config);
            default: {
                // Exhaustiveness check — if a new mode is added, TS will flag this.
                const _exhaustive = config;
                throw new Error(`unknown deliberation mode: ${String(_exhaustive)}`);
            }
        }
    }
    // ── Preset: solo ──────────────────────────────────────────────────
    async runSolo(cfg) {
        const startTime = Date.now();
        const executor = new solo_executor_js_1.SoloExecutor({
            eventStream: this.deps.eventStream,
            registry: this.deps.registry,
            ...(this.deps.costTracker ? { costTracker: this.deps.costTracker } : {}),
            ...(this.deps.workspaceRoot ? { workspaceRoot: this.deps.workspaceRoot } : {}),
            ...(this.deps.toolExecutor ? { toolExecutor: this.deps.toolExecutor } : {}),
            ...(this.deps.toolRegistry ? { toolRegistry: this.deps.toolRegistry } : {}),
        });
        const isConversational = task_router_js_1.TaskRouter.isConversationalTask(cfg.task);
        const soloConfig = {
            model: cfg.model,
            ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
            ...(cfg.maxCompletionTokens !== undefined
                ? { maxCompletionTokens: cfg.maxCompletionTokens }
                : {}),
            ...(cfg.budgetUsd !== undefined ? { budgetUsd: cfg.budgetUsd } : {}),
            ...(cfg.maxDepth !== undefined ? { maxDepth: cfg.maxDepth } : {}),
            ...(cfg.reasoning !== undefined
                ? { reasoning: cfg.reasoning }
                : {}),
            ...(cfg.eternalCoT !== undefined ? { eternalCoT: cfg.eternalCoT } : {}),
            ...(cfg.selfVerify !== undefined ? { selfVerify: cfg.selfVerify } : {}),
            systemPrompt: prompts_js_1.CHIMERA_CORE_IDENTITY,
            isConversational,
        };
        // Auto-CoT: enable thinker if complexity is high or no router available (safe default)
        // eternalCoT: true overrides to always-on, eternalCoT: false overrides to always-off
        if (cfg.eternalCoT === undefined) {
            if (this.deps.taskRouter) {
                const complexity = await this.deps.taskRouter.classifyTask(cfg.task);
                soloConfig.eternalCoT = complexity.overall >= 0.5;
            }
            else {
                soloConfig.eternalCoT = true;
            }
        }
        const context = { depth: this.deps.context?.depth ?? 0 };
        const inner = await executor.executeWithAnalysis(cfg.task, soloConfig, this.deps.providerFactory, context);
        return this.normalizeSolo(inner, startTime);
    }
    // ── Preset: duo ───────────────────────────────────────────────────
    async runDuo(cfg) {
        const startTime = Date.now();
        const executor = new duo_executor_js_1.DuoExecutor({
            eventStream: this.deps.eventStream,
            registry: this.deps.registry,
            ...(this.deps.costTracker ? { costTracker: this.deps.costTracker } : {}),
            ...(this.deps.workspaceRoot ? { workspaceRoot: this.deps.workspaceRoot } : {}),
            ...(this.deps.toolExecutor ? { toolExecutor: this.deps.toolExecutor } : {}),
            ...(this.deps.toolRegistry ? { toolRegistry: this.deps.toolRegistry } : {}),
        });
        const duoConfig = {
            modelA: cfg.modelA,
            modelB: cfg.modelB,
            ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
            ...(cfg.maxCompletionTokens !== undefined
                ? { maxCompletionTokens: cfg.maxCompletionTokens }
                : {}),
            ...(cfg.budgetUsd !== undefined ? { budgetUsd: cfg.budgetUsd } : {}),
            ...(cfg.maxDepth !== undefined ? { maxDepth: cfg.maxDepth } : {}),
            ...(cfg.reasoning !== undefined
                ? { reasoning: cfg.reasoning }
                : {}),
        };
        const context = { depth: this.deps.context?.depth ?? 0 };
        const inner = await executor.executeWithAnalysis(cfg.task, duoConfig, this.deps.providerFactory, context);
        return this.normalizeDuo(inner, startTime);
    }
    // ── Preset: trio ──────────────────────────────────────────────────
    async runTrio(cfg) {
        const startTime = Date.now();
        const executor = new trio_executor_js_1.TrioExecutor({
            eventStream: this.deps.eventStream,
            registry: this.deps.registry,
            ...(this.deps.costTracker ? { costTracker: this.deps.costTracker } : {}),
            ...(this.deps.worktreeIsolation
                ? { worktreeIsolation: this.deps.worktreeIsolation }
                : {}),
            ...(this.deps.workspaceRoot ? { workspaceRoot: this.deps.workspaceRoot } : {}),
            ...(this.deps.toolExecutor ? { toolExecutor: this.deps.toolExecutor } : {}),
            ...(this.deps.toolRegistry ? { toolRegistry: this.deps.toolRegistry } : {}),
        });
        const trioConfig = {
            writer: cfg.writer,
            reviewer: cfg.reviewer,
            ...(cfg.challenger !== undefined ? { challenger: cfg.challenger } : {}),
            ...(cfg.synthesizer !== undefined ? { synthesizer: cfg.synthesizer } : {}),
            ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
            ...(cfg.maxCompletionTokens !== undefined
                ? { maxCompletionTokens: cfg.maxCompletionTokens }
                : {}),
            ...(cfg.budgetUsd !== undefined ? { budgetUsd: cfg.budgetUsd } : {}),
            ...(cfg.maxDepth !== undefined ? { maxDepth: cfg.maxDepth } : {}),
            ...(cfg.isolateWorktree !== undefined ? { isolateWorktree: cfg.isolateWorktree } : {}),
            ...(cfg.parallel !== undefined ? { parallel: cfg.parallel } : {}),
            ...(cfg.reasoning !== undefined
                ? { reasoning: cfg.reasoning }
                : {}),
        };
        const context = { depth: this.deps.context?.depth ?? 0 };
        const inner = await executor.executeWithAnalysis(cfg.task, trioConfig, this.deps.providerFactory, context);
        return this.normalizeTrio(inner, startTime);
    }
    // ── Preset: fusion ────────────────────────────────────────────────
    /**
     * Fusion mode: parallel panel of analysis models → judge synthesizes
     * structured analysis. Delegates to FusionExecutor which handles
     * panel calls, adversarial round, budget enforcement, and judge failover.
     */
    async runFusion(cfg) {
        const startTime = Date.now();
        const executor = new fusion_executor_js_1.FusionExecutor({
            eventStream: this.deps.eventStream,
            registry: this.deps.registry,
            ...(this.deps.costTracker ? { costTracker: this.deps.costTracker } : {}),
        });
        const fusionConfig = {
            analysisModels: cfg.analysisModels,
            panelSize: cfg.panelSize,
            preferLocal: cfg.preferLocal,
            adversarialRound: cfg.adversarialRound,
            diversePerspectives: cfg.diversePerspectives,
            judgeModel: cfg.judgeModel,
            temperature: cfg.temperature,
            maxCompletionTokens: cfg.maxCompletionTokens,
            budgetUsd: cfg.budgetUsd,
            maxDepth: cfg.maxDepth,
            reasoning: cfg.reasoning,
        };
        const res = await executor.executeWithAnalysis(cfg.task, fusionConfig, this.deps.providerFactory, { depth: cfg.maxDepth ?? 0 });
        return {
            mode: 'fusion',
            output: res.output,
            analysis: res.analysis,
            totalTokens: res.totalTokens,
            totalCostUsd: res.totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: res.degraded,
            degradationReason: res.degradationReason,
        };
    }
    // ── Preset: merge ─────────────────────────────────────────────────
    async runMerge(cfg) {
        const startTime = Date.now();
        // The ResultAggregator takes a single LLMProvider. We use the
        // mergeModel config to construct a single provider for the merge call.
        // The current ResultAggregator signature is 1-arg; cost tracking and
        // registry are wired in by the caller when available.
        const provider = this.deps.providerFactory(cfg.mergeModel);
        const aggregator = new result_aggregator_js_1.ResultAggregator(provider);
        const aggregated = await aggregator.aggregate(cfg.subTaskResults);
        // Map the merge output back into the unified 5-field analysis.
        const analysis = {
            thought: '',
            finalResponse: aggregated.output,
            consensus: aggregated.subTaskResults
                .filter((r) => r.status === 'success')
                .map((r) => r.output.split('\n')[0]?.slice(0, 200) ?? ''),
            conflicts: aggregated.conflicts.map((c) => `${c.type}: ${c.description}`),
            uniqueInsights: aggregated.subTaskResults
                .filter((r) => r.status === 'success')
                .map((r) => r.output),
            blindSpots: [],
            confidence: aggregated.resolved ? 0.8 : 0.5,
        };
        return {
            mode: 'merge',
            output: aggregated.output,
            analysis,
            totalTokens: aggregated.totalTokens,
            totalCostUsd: this.deps.costTracker?.getTotalCost() ?? 0,
            durationMs: Date.now() - startTime,
            degraded: !aggregated.resolved,
            ...(aggregated.resolved
                ? {}
                : { degradationReason: 'unresolved conflicts after merge' }),
        };
    }
    // ── Preset: hive ─────────────────────────────────────────────────
    async runHive(cfg) {
        const startTime = Date.now();
        const mergeModelId = cfg.mergeModel ?? cfg.models[0];
        const mergeProvider = this.deps.providerFactory(mergeModelId);
        // 1. Decompose task into subtasks
        const decomposer = new task_decomposer_js_1.TaskDecomposer(mergeProvider);
        const decomposition = await decomposer.decompose(cfg.task, cfg.context);
        // 2. Truncate to maxSubTasks if specified
        const subtaskList = cfg.maxSubTasks
            ? decomposition.subTasks.slice(0, cfg.maxSubTasks)
            : decomposition.subTasks;
        // 3. Assign models to subtasks
        let subTasks;
        if (cfg.modelPool && cfg.modelPool.models.length > 0) {
            // Capability-based routing: use LlmRouter to match subtask type to best model
            subTasks = await this.assignModelsWithRouting(subtaskList, cfg.modelPool);
        }
        else {
            // Fallback: round-robin assignment (backward compatible)
            subTasks = subtaskList.map((st, i) => ({
                ...st,
                provider: this.deps.providerFactory(cfg.models[i % cfg.models.length]),
            }));
        }
        // 4. Execute subtasks in parallel
        const spawner = new sub_agent_spawner_js_1.SubAgentSpawner(this.deps.eventStream);
        const subResults = await spawner.executeAll(subTasks);
        // 5. Aggregate results
        const aggregator = new result_aggregator_js_1.ResultAggregator(mergeProvider);
        const aggregated = await aggregator.aggregate(subResults);
        const analysis = {
            thought: `Decomposed into ${subTasks.length} subtasks (${decomposition.strategy}): ${decomposition.rationale}`,
            finalResponse: aggregated.output,
            consensus: aggregated.subTaskResults
                .filter((r) => r.status === 'success')
                .map((r) => r.output.split('\n')[0]?.slice(0, 200) ?? ''),
            conflicts: aggregated.conflicts.map((c) => `${c.type}: ${c.description}`),
            uniqueInsights: aggregated.subTaskResults
                .filter((r) => r.status === 'success')
                .map((r) => r.output),
            blindSpots: [],
            confidence: aggregated.resolved ? 0.8 : 0.5,
        };
        return {
            mode: 'hive',
            output: aggregated.output,
            analysis,
            totalTokens: aggregated.totalTokens + subResults.reduce((s, r) => s + r.tokensUsed, 0),
            totalCostUsd: this.deps.costTracker?.getTotalCost() ?? 0,
            durationMs: Date.now() - startTime,
            degraded: !aggregated.resolved,
            ...(aggregated.resolved
                ? {}
                : { degradationReason: 'unresolved conflicts after hive merge' }),
        };
    }
    // ── Preset: swarm ────────────────────────────────────────────────
    async runSwarm(cfg) {
        const startTime = Date.now();
        const { SwarmOrchestrator } = await import('../../agent/swarm-orchestrator.js');
        const swarm = new SwarmOrchestrator({
            config: {
                maxAgents: cfg.maxAgents ?? 50,
                maxConcurrency: cfg.maxConcurrency ?? 10,
                clusterSize: cfg.clusterSize ?? 15,
                staggerDelayMs: cfg.staggerDelayMs ?? 50,
            },
            eventStream: this.deps.eventStream,
            costTracker: this.deps.costTracker,
        });
        // Build provider pool from all available providers
        const providerIds = this.deps.availableProviders ?? [];
        if (providerIds.length === 0) {
            return {
                mode: 'swarm',
                output: '',
                analysis: { thought: '', finalResponse: '', consensus: [], conflicts: [], uniqueInsights: [], blindSpots: [], confidence: 0 },
                totalTokens: 0,
                totalCostUsd: 0,
                durationMs: Date.now() - startTime,
                degraded: true,
                degradationReason: 'no providers available for swarm',
            };
        }
        swarm.registerProviders(providerIds.map((id) => ({ id, provider: this.deps.providerFactory(id), weight: 1 })));
        // Decompose task into subtasks
        const subtasks = cfg.task
            .split(/\n+/)
            .filter((l) => l.trim().length > 0)
            .map((part, i) => ({
            id: `swarm-${i}`,
            description: part.replace(/^\d+\.\s*/, '').trim(),
            priority: 10 - i,
        }));
        const tasks = subtasks.length > 0 ? subtasks : [{ id: 'swarm-main', description: cfg.task, priority: 10 }];
        const result = await swarm.execute(tasks);
        const analysis = {
            thought: `Swarm executed ${result.totalAgents} agents (${result.completed} completed, ${result.failed} failed)`,
            finalResponse: result.output,
            consensus: [],
            conflicts: result.failed > 0 ? [`${result.failed} agents failed`] : [],
            uniqueInsights: result.clusterResults ?? [],
            blindSpots: [],
            confidence: result.failed === 0 ? 0.8 : Math.max(0.3, 0.8 - result.failed * 0.1),
        };
        return {
            mode: 'swarm',
            output: result.output,
            analysis,
            totalTokens: result.totalTokens,
            totalCostUsd: result.totalCostUsd,
            durationMs: result.durationMs,
            degraded: result.failed > 0,
            ...(result.failed > 0 ? { degradationReason: `${result.failed}/${result.totalAgents} agents failed` } : {}),
        };
    }
    /**
     * Assign models to subtasks using capability-based routing.
     * Uses LlmRouter to classify each subtask and match it to the best model.
     */
    async assignModelsWithRouting(subtasks, modelPool) {
        // Use LlmRouter for batch classification
        const router = new llm_router_js_1.LlmRouter(this.deps.providerFactory(modelPool.models[0]?.modelId ?? 'default'));
        const routingDecisions = await router.classifyBatch(subtasks.map((st) => ({ id: st.id, description: st.description })), modelPool);
        // Apply routing decisions to subtasks
        return subtasks.map((st) => {
            const decision = routingDecisions.get(st.id);
            const selectedModelId = decision?.selectedModel ?? modelPool.models[0]?.modelId ?? 'default';
            return {
                ...st,
                provider: this.deps.providerFactory(selectedModelId),
            };
        });
    }
    // ── Preset: auto ─────────────────────────────────────────────────
    async runAuto(cfg) {
        // 1. Estimate complexity — use injected taskRouter if available, else heuristic
        const complexity = this.deps.taskRouter
            ? await this.deps.taskRouter.classifyTask(cfg.task)
            : this.estimateComplexity(cfg.task);
        // 2. Select the best preset
        const router = new preset_router_js_1.PresetRouter();
        const availableProviders = this.deps.availableProviders ?? ['default'];
        const selected = router.selectPreset(cfg.task, complexity, availableProviders);
        // 3. Filter to eligible presets if constrained
        const preset = cfg.eligiblePresets && cfg.eligiblePresets.length > 0
            ? cfg.eligiblePresets.includes(selected) ? selected : cfg.eligiblePresets[0]
            : selected;
        // 4. Emit auto_preset_selected telemetry
        const taskType = router.classifyTaskType(cfg.task);
        this.deps.eventStream.append({
            type: 'auto_preset_selected',
            task: cfg.task,
            complexity: complexity.overall,
            selectedPreset: preset,
            taskType,
            timestamp: Date.now(),
        });
        // 5. Delegate to the selected mode
        const delegated = this.buildDelegatedConfig(preset, cfg);
        const inner = await this.run(delegated);
        // 6. Attach autoSelection metadata
        return {
            ...inner,
            mode: 'auto',
            autoSelection: {
                selectedPreset: preset,
                complexity: complexity.overall,
                reason: (0, preset_router_js_1.getAutoSelectionReason)(preset, complexity, taskType),
            },
        };
    }
    estimateComplexity(task) {
        const lower = task.toLowerCase();
        let score = 0.2; // baseline
        // Length signal
        if (task.length > 200)
            score += 0.15;
        if (task.length > 500)
            score += 0.1;
        // Keyword signals
        const highSignals = ['refactor', 'redesign', 'architecture', 'migration', 'comprehensive', 'security', 'concurrent'];
        const medSignals = ['review', 'debug', 'test', 'fix', 'optimize', 'integrate'];
        for (const s of highSignals) {
            if (lower.includes(s))
                score += 0.12;
        }
        for (const s of medSignals) {
            if (lower.includes(s))
                score += 0.06;
        }
        return {
            overall: Math.min(score, 1),
            dimensions: {
                codeVolume: score, architecturalDepth: score, dependencyComplexity: score,
                testCoverage: 0, securitySensitivity: 0, domainNovelty: 0,
                errorHandling: 0, concurrency: 0, externalIntegrations: 0,
                dataTransformation: 0, stateManagement: 0, algorithmicComplexity: 0,
                apiDesign: 0, refactoringScope: 0, crossCuttingConcerns: 0,
            },
        };
    }
    buildDelegatedConfig(preset, autoCfg) {
        const base = { task: autoCfg.task, context: autoCfg.context, temperature: autoCfg.temperature, maxCompletionTokens: autoCfg.maxCompletionTokens, budgetUsd: autoCfg.budgetUsd, maxDepth: autoCfg.maxDepth, reasoning: autoCfg.reasoning };
        // Placeholder complexity for model selection (0.5 = medium)
        const placeholderComplexity = {
            overall: 0.5,
            dimensions: {
                codeVolume: 0.5,
                architecturalDepth: 0.5,
                dependencyComplexity: 0.5,
                testCoverage: 0.5,
                securitySensitivity: 0.5,
                domainNovelty: 0.5,
                errorHandling: 0.5,
                concurrency: 0.5,
                externalIntegrations: 0.5,
                dataTransformation: 0.5,
                stateManagement: 0.5,
                algorithmicComplexity: 0.5,
                apiDesign: 0.5,
                refactoringScope: 0.5,
                crossCuttingConcerns: 0.5,
            },
        };
        // Use TaskRouter for model diversity when available
        const selectModel = (role) => {
            if (this.deps.taskRouter) {
                const provider = this.deps.taskRouter.selectProvider(placeholderComplexity, role);
                if (provider)
                    return provider.model;
            }
            return 'default';
        };
        // Select a model for a role, excluding a specific model to enforce diversity.
        // Falls back to the role's default if no distinct model is available.
        const selectDistinctModel = (role, excludeModel) => {
            if (this.deps.taskRouter) {
                const provider = this.deps.taskRouter.selectProvider(placeholderComplexity, role);
                if (provider && provider.model !== excludeModel)
                    return provider.model;
            }
            return excludeModel; // return same → caller handles fallback
        };
        switch (preset) {
            case 'solo':
                return { ...base, mode: 'solo', model: selectModel('writer') };
            case 'duo': {
                const modelA = selectModel('writer');
                const modelB = selectDistinctModel('reviewer', modelA);
                // Duo requires two distinct models; fall back to solo if unavailable
                if (modelA === modelB) {
                    return { ...base, mode: 'solo', model: modelA };
                }
                return { ...base, mode: 'duo', modelA, modelB };
            }
            case 'trio':
                return {
                    ...base,
                    mode: 'trio',
                    writer: selectModel('writer'),
                    reviewer: selectModel('reviewer'),
                    ...(this.deps.taskRouter?.selectProvider(placeholderComplexity, 'challenger')
                        ? { challenger: selectModel('challenger') }
                        : {}),
                };
            case 'fusion':
                return {
                    ...base,
                    mode: 'fusion',
                    analysisModels: [
                        selectModel('writer'),
                        selectModel('reviewer'),
                        selectModel('challenger'),
                    ],
                    judgeModel: selectModel('synthesizer'),
                };
            case 'hive':
                return {
                    ...base,
                    mode: 'hive',
                    models: [
                        selectModel('writer'),
                        selectModel('reviewer'),
                        selectModel('challenger'),
                    ],
                };
            case 'merge':
                return { ...base, mode: 'merge', subTaskResults: [], mergeModel: selectModel('synthesizer') };
            case 'swarm':
                return { ...base, mode: 'swarm', maxAgents: 50, maxConcurrency: 10 };
            default:
                return { ...base, mode: 'solo', model: selectModel('writer') };
        }
    }
    // ── Normalizers (mode → uniform shape) ────────────────────────────
    normalizeSolo(inner, startTime) {
        const analysis = {
            thought: inner.analysis.thought ?? '',
            finalResponse: inner.analysis.finalResponse ?? inner.output,
            consensus: inner.analysis.consensus ?? [],
            conflicts: inner.analysis.conflicts ?? [],
            uniqueInsights: inner.analysis.uniqueInsights ?? [],
            blindSpots: inner.analysis.blindSpots ?? [],
            confidence: inner.analysis.confidence ?? 0,
        };
        return {
            mode: 'solo',
            output: inner.output,
            analysis,
            totalTokens: inner.totalTokens,
            totalCostUsd: inner.totalCostUsd,
            durationMs: inner.durationMs ?? Date.now() - startTime,
            degraded: inner.degraded,
            ...(inner.degradationReason ? { degradationReason: inner.degradationReason } : {}),
        };
    }
    normalizeDuo(inner, startTime) {
        // DuoAnalysis is already a complete DeliberationAnalysis shape.
        const analysis = {
            thought: inner.analysis.thought,
            finalResponse: inner.analysis.finalResponse,
            consensus: inner.analysis.consensus,
            conflicts: inner.analysis.conflicts,
            uniqueInsights: inner.analysis.uniqueInsights,
            blindSpots: inner.analysis.blindSpots,
            confidence: inner.analysis.confidence,
        };
        return {
            mode: 'duo',
            output: inner.output,
            analysis,
            totalTokens: inner.totalTokens,
            totalCostUsd: inner.totalCostUsd,
            durationMs: inner.durationMs ?? Date.now() - startTime,
            degraded: inner.degraded,
            ...(inner.degradationReason ? { degradationReason: inner.degradationReason } : {}),
        };
    }
    normalizeTrio(inner, startTime) {
        const analysis = {
            thought: inner.analysis.thought ?? '',
            finalResponse: inner.analysis.finalResponse ?? inner.output,
            consensus: inner.analysis.consensus ?? [],
            conflicts: inner.analysis.conflicts ?? [],
            uniqueInsights: inner.analysis.uniqueInsights ?? [],
            blindSpots: inner.analysis.blindSpots ?? [],
            confidence: inner.analysis.confidence ?? 0,
        };
        return {
            mode: 'trio',
            output: inner.output,
            analysis,
            totalTokens: inner.totalTokens,
            totalCostUsd: inner.totalCostUsd,
            durationMs: inner.durationMs ?? Date.now() - startTime,
            degraded: inner.degraded,
            ...(inner.degradationReason ? { degradationReason: inner.degradationReason } : {}),
        };
    }
}
exports.DeliberationEngine = DeliberationEngine;
// ── Preset factories (optional convenience helpers) ────────────────
/**
 * Convenience factories for the 5 modes. These produce the typed
 * `DeliberationConfig` directly without requiring callers to fill in
 * the `mode` discriminator manually.
 */
exports.presets = {
    solo: (model, task) => ({ mode: 'solo', model, task }),
    duo: (modelA, modelB, task) => ({
        mode: 'duo',
        modelA,
        modelB,
        task,
    }),
    trio: (writer, reviewer, task, challenger) => ({
        mode: 'trio',
        writer,
        reviewer,
        ...(challenger !== undefined ? { challenger } : {}),
        task,
    }),
    fusion: (analysisModels, judgeModel, task) => ({
        mode: 'fusion',
        analysisModels,
        judgeModel,
        task,
    }),
    merge: (subTaskResults, mergeModel) => ({
        mode: 'merge',
        subTaskResults,
        mergeModel,
        task: '',
    }),
    hive: (models, task, modelPool) => ({
        mode: 'hive',
        models,
        task,
        ...(modelPool ? { modelPool } : {}),
    }),
    auto: (task) => ({
        mode: 'auto',
        task,
    }),
};
//# sourceMappingURL=engine.js.map