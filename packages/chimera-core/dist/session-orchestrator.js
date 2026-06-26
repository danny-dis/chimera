"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionOrchestrator = void 0;
const event_stream_js_1 = require("./event-stream.js");
const cost_tracker_js_1 = require("./cost-tracker.js");
const task_router_js_1 = require("./task-router.js");
const agent_mesh_js_1 = require("./agent-mesh.js");
const response_synthesizer_js_1 = require("./response-synthesizer.js");
const prompt_guard_js_1 = require("./security/prompt-guard.js");
const prompts_js_1 = require("./prompts.js");
const audit_log_js_1 = require("./security/audit-log.js");
const biome_linter_js_1 = require("./coordinator/biome-linter.js");
/**
 * Cross-mode validation: which presets are valid for each mode.
 * Invalid combinations are wasteful (e.g. ask + fusion burns tokens for zero benefit).
 * 'auto' preset bypasses this validation since it self-selects.
 */
const VALID_MODE_PRESET_COMBOS = {
    ask: ['solo'],
    plan: ['solo', 'duo'],
    code: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive'],
    debug: ['auto', 'solo', 'duo', 'trio', 'fusion'],
    review: ['auto', 'duo', 'trio', 'fusion'],
    oal: ['solo'],
    auto: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive'],
};
const context_1 = require("@chimera/context");
const context_2 = require("@chimera/context");
const instruction_discovery_js_1 = require("./instruction-discovery.js");
const engine_js_1 = require("./coordinator/deliberation/engine.js");
const model_capabilities_js_1 = require("./coordinator/model-capabilities.js");
let agentCounter = 0;
function nextAgentId() {
    return `agent-${++agentCounter}`;
}
const MAX_TOOL_ITERATIONS = 10;
class SessionOrchestrator {
    state = { status: 'idle' };
    eventStream;
    costTracker;
    taskRouter;
    agentMesh;
    synthesizer;
    toolRegistry = null;
    toolExecutor = null;
    memory = null;
    contextEngine = null;
    budgetEnforcer = null;
    rateLimiter = null;
    auditLog;
    relayRacing;
    handoffProtocol;
    linter;
    _workspaceRoot;
    workflowExecutor = null;
    _sessionId = `session-${Date.now()}`;
    _writerMessages = [];
    _registry = null;
    autoExtract = null;
    recallService = null;
    autoDream = null;
    _extractionCursor = 0;
    constructor(eventStream, tools, workspaceRoot, memory, options) {
        this.eventStream = eventStream ?? new event_stream_js_1.EventStream();
        this.costTracker = new cost_tracker_js_1.CostTracker(this.eventStream);
        this.taskRouter = new task_router_js_1.TaskRouter(this.eventStream);
        this.agentMesh = new agent_mesh_js_1.AgentMesh(this.eventStream);
        this.synthesizer = new response_synthesizer_js_1.ResponseSynthesizer(this.eventStream);
        this._workspaceRoot = workspaceRoot ?? process.cwd();
        this.memory = options?.memoryPersistence?.getMemory() ?? memory ?? null;
        this.contextEngine = options?.contextEngine ?? null;
        this.budgetEnforcer = options?.budgetEnforcer ?? null;
        this.rateLimiter = options?.rateLimiter ?? null;
        this.auditLog = options?.auditLog ?? new audit_log_js_1.AuditLog();
        this.relayRacing = new context_1.RelayRacing({ defaultContextWindow: 200_000 });
        this.relayRacing.registerAgent('default', 200_000);
        this.handoffProtocol = new context_1.HandoffProtocol();
        this.linter = new biome_linter_js_1.BiomeLinter({ configPath: this._workspaceRoot });
        this._registry = options?.registry ?? null;
        this.autoExtract = options?.autoExtract ?? null;
        this.recallService = options?.recallService ?? null;
        this.autoDream = options?.autoDream ?? null;
        if (tools) {
            this.toolRegistry = tools.registry;
            this.toolExecutor = tools.executor;
        }
    }
    setWorkflowExecutor(executor) {
        this.workflowExecutor = executor;
    }
    async executeWorkflow(task, providers) {
        if (!this.workflowExecutor)
            throw new Error('Workflow executor not configured');
        // 1. Generate workflow script
        const workflowPrompt = (0, prompts_js_1.buildWorkflowGeneratorPrompt)(task);
        const result = await providers.writer.complete(workflowPrompt, { temperature: 0.1 });
        const script = result.content.match(/```javascript\n([\s\S]*?)```/)?.[1] ?? '';
        // 2. Execute
        this.eventStream.append({ type: 'workflow_started', task });
        const output = await this.workflowExecutor.execute(script);
        this.eventStream.append({ type: 'workflow_completed', task, output });
        return output;
    }
    getState() {
        return this.state;
    }
    getEventStream() {
        return this.eventStream;
    }
    getCostTracker() {
        return this.costTracker;
    }
    getAuditLog() {
        return this.auditLog;
    }
    exportState(sessionId, task, mode) {
        const events = [...this.eventStream.getAll()];
        return {
            sessionId,
            timestamp: new Date().toISOString(),
            task,
            mode,
            messages: [],
            toolCallHistory: [],
            events,
            costSpend: {},
            metadata: {
                agentCount: events.filter((e) => e.type === 'agent_spawned').length,
                turnCount: events.filter((e) => e.type === 'draft_proposed').length,
                status: this.state.status === 'error' ? 'failed' : this.state.status === 'complete' ? 'completed' : 'active',
                auditLogSize: this.auditLog.size(),
            },
        };
    }
    async restoreState(checkpoint) {
        if (checkpoint.metadata?.status === 'completed') {
            this.transition({ status: 'complete', result: checkpoint.task ?? '', cost: 0 });
        }
        else if (checkpoint.metadata?.status === 'failed') {
            this.transition({ status: 'error', error: 'restored from checkpoint' });
        }
        else {
            this.transition({ status: 'idle' });
        }
    }
    buildAgentConfig(id, role, costCap) {
        return {
            id,
            role,
            provider: 'llm',
            model: 'default',
            constraints: {
                maxTokensPerTurn: 4096,
                costCapPerTask: costCap,
                costCapPerSession: costCap * 2,
                costCapPerDay: costCap * 5,
                maxParallelInstances: 1,
                rateLimitRpm: 60,
            },
        };
    }
    async execute(params) {
        const { task, mode, providers, preset, costCap = 10 } = params;
        const outputs = [];
        let totalCost = 0;
        // Validate mode+preset combination (skip validation for 'auto' preset)
        const resolvedPreset = preset ?? this.mapModeToDeliberationMode(mode);
        if (preset && preset !== 'auto') {
            const allowed = VALID_MODE_PRESET_COMBOS[mode];
            if (allowed && !allowed.includes(preset)) {
                this.eventStream.append({
                    type: 'mode_preset_warning',
                    mode,
                    preset,
                    resolvedPreset,
                    reason: `Preset "${preset}" is not optimal for mode "${mode}". Allowed: [${allowed.join(', ')}]. Using "${resolvedPreset}" instead.`,
                });
                // Downgrade to the mode's default preset
                params.preset = this.mapModeToDeliberationMode(mode);
            }
        }
        try {
            this.eventStream.append({ type: 'user_request', text: task, mode });
            if (this.autoDream) {
                this.autoDream.shouldDream().then((should) => {
                    if (should) {
                        this.autoDream.dream().catch(() => { });
                    }
                }).catch(() => { });
            }
            const injectionCheck = (0, prompt_guard_js_1.checkUserInput)(task);
            if (!injectionCheck.safe && injectionCheck.confidence > 0.85) {
                this.logSecurityEvent('prompt_injection_detected', injectionCheck.confidence, injectionCheck.flags);
                this.eventStream.append({
                    type: 'final_response',
                    status: 'blocked',
                    cost: 0,
                    agentCount: 0,
                });
                return {
                    status: 'error',
                    output: `Blocked: prompt injection attempt detected (${injectionCheck.flags.join(', ')})`,
                    cost: 0,
                    agentCount: 0,
                    events: [...this.eventStream.getAll()],
                };
            }
            let memoryContext = '';
            const instructions = (0, instruction_discovery_js_1.discoverInstructions)(this._workspaceRoot);
            const instructionContext = (0, instruction_discovery_js_1.buildInstructionContext)(instructions);
            if (instructionContext) {
                memoryContext += instructionContext + '\n\n---\n\n';
            }
            if (this.contextEngine) {
                try {
                    await this.contextEngine.indexRepo();
                    const contextPack = await this.contextEngine.buildContextPack({
                        task,
                        maxTokens: 16000,
                    });
                    if (contextPack.files.length > 0) {
                        memoryContext = contextPack.files
                            .map((f) => `[${f.path}] (${f.reason}, ${f.tokens} tokens)\n${f.content.slice(0, 500)}`)
                            .join('\n---\n');
                        this.eventStream.append({
                            type: 'context_pack_created',
                            files: contextPack.files.map((f) => f.path),
                            tokenEstimate: contextPack.totalTokens,
                        });
                    }
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.eventStream?.append({
                        type: 'error',
                        message: `Failed to build context pack: ${msg}`,
                    });
                }
            }
            else if (this.recallService) {
                try {
                    const recalled = await this.recallService.recall({ query: task, sessionId: this._sessionId });
                    if (recalled) {
                        memoryContext = recalled;
                        this.eventStream.append({
                            type: 'context_pack_created',
                            files: [],
                            tokenEstimate: Math.ceil(recalled.length / 4),
                        });
                    }
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.eventStream?.append({
                        type: 'error',
                        message: `Failed to recall memory: ${msg}`,
                    });
                }
            }
            else if (this.memory) {
                try {
                    const memories = await this.memory.retrieve({ text: task, topK: 5 });
                    if (memories.length > 0) {
                        memoryContext = memories
                            .map((m) => `- ${m.item.content} (relevance: ${m.score.toFixed(2)})`)
                            .join('\n');
                        this.eventStream.append({
                            type: 'context_pack_created',
                            files: [],
                            tokenEstimate: Math.ceil(memoryContext.length / 4),
                        });
                    }
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.eventStream?.append({
                        type: 'error',
                        message: `Failed to load memory context: ${msg}`,
                    });
                }
            }
            this.transition({ status: 'classifying', task });
            const complexity = await this.taskRouter.classifyTask(task);
            let resolvedMode = mode;
            if (mode === 'auto') {
                resolvedMode = this.taskRouter.suggestMode(task, complexity);
                this.eventStream.append({
                    type: 'mode_suggested',
                    requested: 'auto',
                    suggested: resolvedMode,
                    complexity: complexity.overall,
                });
            }
            // Telemetry: track mode+preset combination for optimization
            const resolvedPresetForTelemetry = preset ?? this.mapModeToDeliberationMode(resolvedMode, complexity);
            this.eventStream.append({
                type: 'mode_preset_resolved',
                mode: resolvedMode,
                preset: resolvedPresetForTelemetry,
                complexity: complexity.overall,
                task,
                timestamp: Date.now(),
            });
            // --- Delegate to DeliberationEngine (primary path) ---
            if (this._registry) {
                try {
                    const delibResult = await this.executeWithDeliberation(task, resolvedMode, providers, costCap, preset, complexity);
                    return this.deliberationToOrchestratorResult(delibResult, task, resolvedMode);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.eventStream.append({
                        type: 'error',
                        message: `DeliberationEngine failed, falling back to inline flow: ${msg}`,
                    });
                }
            }
            // --- Inline fallback (backward-compatible) ---
            this.transition({ status: 'planning', task, complexity });
            const needsVerification = this.shouldVerify(resolvedMode, complexity);
            const writerId = nextAgentId();
            this.transition({ status: 'drafting', task, agentId: writerId });
            this.agentMesh.registerAgent(this.buildAgentConfig(writerId, 'writer', costCap));
            const toolDefs = this.buildToolDefinitions();
            const writerMessages = this.buildWriterPrompt(task, resolvedMode);
            const budgetCheck = this.checkBudget(8192);
            if (budgetCheck && budgetCheck.action === 'stop') {
                this.eventStream.append({
                    type: 'cost_alert',
                    currentCost: budgetCheck.currentCost,
                    budget: budgetCheck.budget,
                    percentage: budgetCheck.percentage,
                    action: 'stop',
                });
                return this.finalize('blocked', outputs, totalCost, task, resolvedMode);
            }
            await this.enforceRateLimit(8192);
            let draftResult = await providers.writer.complete(writerMessages, {
                temperature: 0.7,
                maxTokens: 4096,
                responseFormat: 'json_object',
                tools: toolDefs.length > 0 ? toolDefs : undefined,
            });
            let draftCost = this.estimateCost(draftResult.usage);
            totalCost += draftCost;
            this.costTracker.recordSpend('writer', draftCost);
            this.logLLMCall('writer', draftResult.usage.inputTokens, draftResult.usage.outputTokens, draftCost);
            const toolCallHistory = [];
            let iterations = 0;
            this._writerMessages = [...writerMessages];
            while (draftResult.toolCalls && draftResult.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
                iterations++;
                const toolResults = await this.executeToolCalls(draftResult.toolCalls, { sessionId: writerId });
                toolCallHistory.push(...toolResults);
                for (const tr of toolResults) {
                    this.logToolCall(tr.toolName, JSON.stringify(tr.args).slice(0, 100), tr.result.result.duration * 0.000001);
                }
                const toolMessages = this.buildToolResultMessages(writerMessages, draftResult, toolResults);
                const inputTokens = draftResult.usage.inputTokens + draftResult.usage.outputTokens;
                const threshold = this.relayRacing.trackTokens('default', inputTokens);
                let maskedMessages = this.relayRacing.maskObservations(toolMessages);
                if (maskedMessages !== toolMessages) {
                    this.relayRacing.trackMaskedObservation('default', JSON.stringify(toolMessages), JSON.stringify(maskedMessages));
                }
                if (threshold.recommendedAction === 'handoff' || threshold.recommendedAction === 'emergency_handoff') {
                    const compacted = (0, context_2.runCompactionPipeline)(this._writerMessages);
                    this._writerMessages = compacted.messages;
                    const events = [...this.eventStream.getAll()];
                    const handoffDoc = this.handoffProtocol.createCompactingHandoff(events, {
                        session: this._sessionId,
                        agent: writerId,
                        contextFill: threshold.fillPercent,
                    });
                    const validation = this.handoffProtocol.validateHandoff(handoffDoc);
                    this.eventStream.append({
                        type: 'handoff_triggered',
                        fromAgent: writerId,
                        toAgent: 'next-writer',
                        reason: threshold.tier === 'emergency' ? 'context_threshold' : 'task_boundary',
                        format: 'compact',
                        tokenCount: compacted.totalTokensSaved,
                        claimIds: handoffDoc.meta.claims,
                    });
                    this.eventStream.append({
                        type: 'handoff_validated',
                        accepted: validation.dataComplete && validation.referencesGrounded && validation.claimsVerified && validation.capabilityMatch,
                        checklist: validation,
                        clarifications: [],
                    });
                    if (validation.dataComplete) {
                        const serialized = this.handoffProtocol.serializeHandoff(handoffDoc);
                        writerMessages.push({ role: 'system', content: `## Context Handoff\n${serialized}` });
                    }
                }
                const iterBudget = this.checkBudget(8192);
                if (iterBudget && iterBudget.action === 'stop')
                    break;
                await this.enforceRateLimit(8192);
                draftResult = await providers.writer.complete(maskedMessages, {
                    temperature: 0.7,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                    tools: toolDefs.length > 0 ? toolDefs : undefined,
                });
                const iterCost = this.estimateCost(draftResult.usage);
                draftCost += iterCost;
                totalCost += iterCost;
                this.costTracker.recordSpend('writer', iterCost);
                this.logLLMCall('writer', draftResult.usage.inputTokens, draftResult.usage.outputTokens, iterCost);
            }
            const draftParsed = this.parseJSON(draftResult.content);
            const draftContent = draftParsed.response ?? draftResult.content;
            const draftConfidence = draftParsed.confidence ?? 0.5;
            outputs.push({
                agentId: writerId,
                role: 'writer',
                content: draftContent,
                confidence: draftConfidence,
                provider: 'llm',
                model: 'default',
                tokensUsed: draftResult.usage.inputTokens + draftResult.usage.outputTokens,
            });
            this.eventStream.append({
                type: 'draft_proposed',
                agentId: writerId,
                patchId: `patch-${writerId}`,
                confidence: draftConfidence,
            });
            if (!needsVerification) {
                return this.finalize('done', outputs, totalCost, task, resolvedMode);
            }
            const reviewerId = nextAgentId();
            this.transition({ status: 'verifying', task, draft: draftContent, agentId: reviewerId });
            this.agentMesh.registerAgent(this.buildAgentConfig(reviewerId, 'reviewer', costCap));
            const reviewerBudget = this.checkBudget(8192);
            if (reviewerBudget && reviewerBudget.action === 'stop') {
                return this.finalize('done', outputs, totalCost, task, resolvedMode);
            }
            await this.enforceRateLimit(8192);
            const reviewerMessages = this.buildReviewerPrompt(task, draftContent, resolvedMode);
            const reviewResult = await providers.reviewer.complete(reviewerMessages, {
                temperature: 0.2,
                maxTokens: 4096,
                responseFormat: 'json_object',
            });
            const reviewCost = this.estimateCost(reviewResult.usage);
            totalCost += reviewCost;
            this.costTracker.recordSpend('reviewer', reviewCost);
            this.logLLMCall('reviewer', reviewResult.usage.inputTokens, reviewResult.usage.outputTokens, reviewCost);
            const reviewParsed = this.parseJSON(reviewResult.content);
            const verdict = reviewParsed.verdict ?? 'PASS';
            const findings = reviewParsed.findings ?? [];
            outputs.push({
                agentId: reviewerId,
                role: 'reviewer',
                content: reviewResult.content,
                confidence: reviewParsed.confidence ?? 0.5,
                provider: 'llm',
                model: 'default',
                tokensUsed: reviewResult.usage.inputTokens + reviewResult.usage.outputTokens,
            });
            this.eventStream.append({
                type: 'verified',
                agentId: reviewerId,
                verdict: verdict === 'PASS' ? 'pass' : verdict === 'FAIL' ? 'fail' : 'needs_revision',
                findings: findings.map((f) => ({
                    description: f.description,
                    severity: f.severity,
                    evidence: f.evidence,
                })),
            });
            if (providers.challenger && verdict !== 'PASS') {
                const challengerId = nextAgentId();
                this.transition({
                    status: 'challenging',
                    task,
                    draft: draftContent,
                    review: reviewResult.content,
                    agentId: challengerId,
                });
                this.agentMesh.registerAgent(this.buildAgentConfig(challengerId, 'challenger', costCap));
                const challengerBudget = this.checkBudget(8192);
                if (challengerBudget && challengerBudget.action === 'stop') {
                    return this.finalize('needs_user', outputs, totalCost, task, resolvedMode);
                }
                await this.enforceRateLimit(8192);
                const challengerMessages = this.buildChallengerPrompt(task, draftContent, reviewResult.content);
                const challengeResult = await providers.challenger.complete(challengerMessages, {
                    temperature: 0.5,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                });
                const challengeCost = this.estimateCost(challengeResult.usage);
                totalCost += challengeCost;
                this.costTracker.recordSpend('challenger', challengeCost);
                this.logLLMCall('challenger', challengeResult.usage.inputTokens, challengeResult.usage.outputTokens, challengeCost);
                const challengeParsed = this.parseJSON(challengeResult.content);
                outputs.push({
                    agentId: challengerId,
                    role: 'challenger',
                    content: challengeParsed.response ?? challengeResult.content,
                    confidence: challengeParsed.confidence ?? 0.5,
                    provider: 'llm',
                    model: 'default',
                    tokensUsed: challengeResult.usage.inputTokens + challengeResult.usage.outputTokens,
                });
                this.eventStream.append({
                    type: 'challenged',
                    agentId: challengerId,
                    challenges: challengeParsed.issues ?? [],
                    alternatives: challengeParsed.filesChanged ?? [],
                });
                if (verdict === 'FAIL') {
                    return this.finalize('needs_user', outputs, totalCost, task, resolvedMode);
                }
            }
            return this.finalize('done', outputs, totalCost, task, resolvedMode);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.transition({ status: 'error', error: message });
            this.eventStream.append({
                type: 'final_response',
                status: 'blocked',
                cost: totalCost,
                agentCount: outputs.length,
            });
            return { status: 'error', output: '', cost: totalCost, agentCount: outputs.length, events: [...this.eventStream.getAll()] };
        }
    }
    async executeWithDeliberation(task, mode, providers, costCap = 10, preset, complexity) {
        if (!this._registry) {
            throw new Error('ModelRegistry required for deliberation — pass options.registry');
        }
        const engine = new engine_js_1.DeliberationEngine({
            eventStream: this.eventStream,
            registry: this._registry,
            costTracker: this.costTracker,
            providerFactory: this.buildProviderFactory(providers),
        });
        const config = this.buildDeliberationConfig(task, mode, providers, costCap, preset, complexity);
        return engine.run(config);
    }
    buildProviderFactory(providers) {
        return (modelId) => {
            switch (modelId) {
                case 'reviewer':
                    return providers.reviewer;
                case 'challenger':
                    return providers.challenger ?? providers.writer;
                default:
                    return providers.writer;
            }
        };
    }
    mapModeToDeliberationMode(mode, complexity) {
        switch (mode) {
            case 'code':
            case 'debug': {
                // Complexity-gated selection: trivial → solo, medium → duo, complex → trio
                if (!complexity)
                    return 'trio'; // fallback when no complexity available
                if (complexity.overall < 0.3)
                    return 'solo'; // trivial: single model
                if (complexity.overall < 0.6)
                    return 'duo'; // medium: two models
                return 'trio'; // complex: full pipeline
            }
            case 'review':
                return 'duo';
            case 'ask':
            case 'plan':
            default:
                return 'solo';
        }
    }
    buildDeliberationConfig(task, mode, providers, costCap, preset, complexity) {
        const delibMode = preset ?? this.mapModeToDeliberationMode(mode, complexity);
        const base = { task, budgetUsd: costCap, temperature: 0.7, maxCompletionTokens: 4096 };
        switch (delibMode) {
            case 'solo':
                return { ...base, mode: 'solo', model: 'default' };
            case 'duo':
                return { ...base, mode: 'duo', modelA: 'default', modelB: 'default' };
            case 'trio':
                return {
                    ...base,
                    mode: 'trio',
                    writer: 'default',
                    reviewer: 'default',
                    ...(providers.challenger ? { challenger: 'default' } : {}),
                };
            case 'fusion':
                return { ...base, mode: 'fusion', analysisModels: ['default'], judgeModel: 'default' };
            case 'hive': {
                // Build model pool from registry for capability-based routing
                const modelIds = this._registry
                    ? this._registry.getAll().filter((m) => !m.deprecated).map((m) => m.id)
                    : ['default'];
                const modelPool = (0, model_capabilities_js_1.buildPool)(modelIds, { preferFrontierForJudge: true });
                return {
                    ...base,
                    mode: 'hive',
                    models: modelIds.slice(0, 6), // Limit to 6 models for practical concurrency
                    modelPool,
                };
            }
            case 'auto':
                return { ...base, mode: 'auto' };
            case 'merge':
                return { ...base, mode: 'merge', subTaskResults: [], mergeModel: 'default' };
        }
    }
    deliberationToOrchestratorResult(delib, task, mode) {
        const status = delib.degraded ? 'error' : delib.analysis.confidence < 0.3 ? 'needs_user' : 'done';
        this.transition({ status: 'complete', result: delib.output, cost: delib.totalCostUsd });
        this.eventStream.append({
            type: 'deliberation_result',
            mode: delib.mode,
            output: delib.output,
            analysis: delib.analysis,
        });
        this.eventStream.append({
            type: 'final_response',
            status: status === 'error' ? 'blocked' : status,
            cost: delib.totalCostUsd,
            agentCount: 1,
            output: delib.output,
        });
        if (this.memory && status === 'done') {
            this.memory.write({
                content: `Task: ${task}\nResult: ${delib.output.slice(0, 500)}`,
                topic: mode,
                importance: 0.6,
                source: 'user',
                tags: [mode, 'task-result'],
            }).catch((err) => {
                this.eventStream?.append({
                    type: 'error',
                    message: `Failed to persist task result to memory: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
        }
        if (this.autoExtract && task) {
            this.autoExtract.extract({
                messages: this._writerMessages,
                sessionId: this._sessionId,
                cursor: this._extractionCursor,
            }).then((newCursor) => {
                this._extractionCursor = newCursor;
            }).catch(() => { });
        }
        return {
            status,
            output: delib.output,
            cost: delib.totalCostUsd,
            agentCount: 1,
            events: [...this.eventStream.getAll()],
        };
    }
    finalize(status, outputs, totalCost, task, mode) {
        const synthesis = this.synthesizer.synthesize(this.toSynthesisInputs(outputs));
        const resolvedStatus = synthesis.needsUserEscalation ? 'needs_user' : status;
        this.transition({ status: 'complete', result: synthesis.unifiedResponse, cost: totalCost });
        // Map internal synthesis to external deliberation analysis shape
        const analysis = {
            thought: '',
            consensus: outputs.length > 1 ? [synthesis.unifiedResponse.split('\n')[0]] : [],
            conflicts: synthesis.conflicts.map(c => `${c.type}: ${c.description}`),
            uniqueInsights: synthesis.mergedIssues.map(i => i.description),
            blindSpots: [],
            confidence: synthesis.overallConfidence,
        };
        this.eventStream.append({
            type: 'deliberation_result',
            mode: mode === 'merge' ? 'merge' : (outputs.length > 2 ? 'trio' : (outputs.length > 1 ? 'duo' : 'solo')),
            output: synthesis.unifiedResponse,
            analysis,
        });
        this.eventStream.append({
            type: 'final_response',
            status: resolvedStatus === 'error' ? 'blocked' : resolvedStatus,
            cost: totalCost,
            agentCount: outputs.length,
            output: synthesis.unifiedResponse,
        });
        if (this.memory && resolvedStatus === 'done' && task && mode) {
            this.memory.write({
                content: `Task: ${task}\nResult: ${synthesis.unifiedResponse.slice(0, 500)}`,
                topic: mode,
                importance: 0.6,
                source: 'user',
                tags: [mode, 'task-result'],
            }).catch((err) => {
                // Memory write is best-effort; log but don't block orchestrator
                this.eventStream?.append({
                    type: 'error',
                    message: `Failed to persist task result to memory: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
        }
        if (this.autoExtract && task) {
            this.autoExtract.extract({
                messages: this._writerMessages,
                sessionId: this._sessionId,
                cursor: this._extractionCursor,
            }).then((newCursor) => {
                this._extractionCursor = newCursor;
            }).catch(() => { });
        }
        return {
            status: resolvedStatus,
            output: synthesis.unifiedResponse,
            cost: totalCost,
            agentCount: outputs.length,
            events: [...this.eventStream.getAll()],
        };
    }
    toSynthesisInputs(outputs) {
        return outputs.map((o) => ({
            agentId: o.agentId,
            role: o.role,
            content: o.content,
            confidence: o.confidence,
        }));
    }
    async executeQualityGateParallel(params) {
        const { task, draft, mode, providers, costCap } = params;
        const startTime = Date.now();
        const outputs = [];
        const reviewerId = nextAgentId();
        const challengerId = nextAgentId();
        this.agentMesh.registerAgent(this.buildAgentConfig(reviewerId, 'reviewer', costCap));
        if (providers.challenger) {
            this.agentMesh.registerAgent(this.buildAgentConfig(challengerId, 'challenger', costCap));
        }
        this.eventStream.append({
            type: 'quality_gate_parallel_started',
            reviewerId,
            challengerId,
            draftPreview: draft.slice(0, 200),
        });
        const reviewerPromise = (async () => {
            const reviewerMessages = this.buildReviewerPrompt(task, draft, mode);
            const result = await providers.reviewer.complete(reviewerMessages, {
                temperature: 0.2,
                maxTokens: 4096,
                responseFormat: 'json_object',
            });
            const cost = this.estimateCost(result.usage);
            this.costTracker.recordSpend('reviewer', cost);
            const parsed = this.parseJSON(result.content);
            outputs.push({
                agentId: reviewerId,
                role: 'reviewer',
                content: result.content,
                confidence: parsed.confidence ?? 0.5,
                provider: 'llm',
                model: 'default',
                tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
            });
            this.eventStream.append({
                type: 'verified',
                agentId: reviewerId,
                verdict: parsed.verdict === 'PASS' ? 'pass' : parsed.verdict === 'FAIL' ? 'fail' : 'needs_revision',
                findings: (parsed.findings ?? []).map((f) => ({
                    description: f.description,
                    severity: f.severity,
                    evidence: f.evidence,
                })),
            });
            return {
                verdict: parsed.verdict ?? 'PASS',
                confidence: parsed.confidence ?? 0.5,
                findings: parsed.findings ?? [],
                raw: result.content,
            };
        })();
        const challenger = providers.challenger;
        const challengerPromise = challenger
            ? (async () => {
                const challengerMessages = this.buildChallengerPrompt(task, draft, '');
                const result = await challenger.complete(challengerMessages, {
                    temperature: 0.5,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                });
                const cost = this.estimateCost(result.usage);
                this.costTracker.recordSpend('challenger', cost);
                const parsed = this.parseJSON(result.content);
                outputs.push({
                    agentId: challengerId,
                    role: 'challenger',
                    content: parsed.response ?? result.content,
                    confidence: parsed.confidence ?? 0.5,
                    provider: 'llm',
                    model: 'default',
                    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
                });
                this.eventStream.append({
                    type: 'challenged',
                    agentId: challengerId,
                    challenges: parsed.issues ?? [],
                    alternatives: parsed.filesChanged ?? [],
                });
                return {
                    response: parsed.response ?? result.content,
                    confidence: parsed.confidence ?? 0.5,
                    issues: parsed.issues ?? [],
                    alternatives: parsed.filesChanged ?? [],
                    raw: result.content,
                };
            })()
            : Promise.reject(new Error('No challenger provider'));
        const [reviewResult, challengeResult] = await Promise.allSettled([
            reviewerPromise,
            challengerPromise,
        ]);
        const durationMs = Date.now() - startTime;
        const reviewData = reviewResult.status === 'fulfilled'
            ? { status: 'fulfilled', ...reviewResult.value }
            : {
                status: 'rejected',
                error: reviewResult.reason instanceof Error ? reviewResult.reason.message : String(reviewResult.reason),
            };
        const challengeData = challengeResult.status === 'fulfilled'
            ? { status: 'fulfilled', ...challengeResult.value }
            : {
                status: 'rejected',
                error: challengeResult.reason instanceof Error ? challengeResult.reason.message : String(challengeResult.reason),
            };
        this.eventStream.append({
            type: 'quality_gate_parallel_completed',
            reviewerId,
            challengerId,
            reviewerStatus: reviewData.status,
            challengerStatus: challengeData.status,
            durationMs,
        });
        return {
            qualityGate: { review: reviewData, challenge: challengeData },
            execution: {
                successCount: [reviewData.status, challengeData.status].filter((s) => s === 'fulfilled').length,
                failureCount: [reviewData.status, challengeData.status].filter((s) => s === 'rejected').length,
                totalCount: 2,
                durationMs,
            },
            outputs,
        };
    }
    transition(next) {
        this.state = next;
    }
    checkBudget(estimatedTokens) {
        if (!this.budgetEnforcer)
            return null;
        return this.budgetEnforcer.check(estimatedTokens * 0.000002, this._sessionId);
    }
    async enforceRateLimit(estimatedTokens) {
        if (this.rateLimiter) {
            await this.rateLimiter.acquire(estimatedTokens);
        }
    }
    logLLMCall(model, inputTokens, outputTokens, cost) {
        this.auditLog.logLLMCall({
            sessionId: this._sessionId,
            model,
            inputTokens,
            outputTokens,
            tokenCost: cost,
        });
    }
    logToolCall(tool, paramsHash, cost) {
        this.auditLog.logToolCall({
            sessionId: this._sessionId,
            tool,
            paramsHash,
            userApproved: true,
            tokenCost: cost,
        });
    }
    logSecurityEvent(event, confidence, flags) {
        this.auditLog.logSecurityEvent({
            sessionId: this._sessionId,
            event,
            confidence,
            flags,
        });
    }
    shouldVerify(mode, complexity) {
        if (mode === 'ask' && complexity.overall < 0.4)
            return false;
        return true;
    }
    buildWriterPrompt(task, mode) {
        const messages = (0, prompts_js_1.buildMessages)({ role: 'writer', mode, task });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "filesChanged": string[], "issues": string[], "rationale": string}',
            'The "thought" field must contain your comprehensive Chain-of-Thought reasoning.',
            'The "response" field contains your main output.',
            'The "confidence" field is how confident you are (0 = guessing, 1 = certain).',
            'The "filesChanged" field lists any files referenced or modified.',
            'The "rationale" field explains why you chose this approach.',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    buildReviewerPrompt(task, draft, mode) {
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'reviewer',
            mode,
            task: [
                `## Original Task\n${task}`,
                `## Draft Output\n${draft}`,
                '',
                'Evaluate the draft against the task. Return structured JSON.',
            ].join('\n'),
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "verdict": "PASS" | "FAIL" | "NEEDS_REVISION", "confidence": number 0-1, "findings": Array<{description: string, severity: "high"|"med"|"low", evidence: string}>}',
            'The "thought" field must contain your detailed reasoning and adversarial critique.',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    buildChallengerPrompt(task, draft, review) {
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'challenger',
            mode: 'review', // Use review mode for challenging
            task: [
                `## Original Task\n${task}`,
                `## Writer Draft\n${draft}`,
                `## Reviewer Verdict\n${review}`,
                '',
                'Critique both the draft and the review. Propose alternatives if needed. Return structured JSON.',
            ].join('\n'),
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "issues": string[], "filesChanged": string[]}',
            'The "thought" field must contain your adversarial reasoning and architectural dissent.',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    parseJSON(raw) {
        try {
            const trimmed = raw.trim();
            const jsonStart = trimmed.indexOf('{');
            const jsonEnd = trimmed.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1)
                return {};
            return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
        }
        catch {
            return {};
        }
    }
    estimateCost(usage) {
        const inputRate = 0.5 / 1_000_000;
        const outputRate = 1.5 / 1_000_000;
        return usage.inputTokens * inputRate + usage.outputTokens * outputRate;
    }
    buildToolDefinitions() {
        if (!this.toolRegistry)
            return [];
        return this.toolRegistry.getAll().map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters.toJSON?.() ?? { type: 'object' },
        }));
    }
    async executeToolCalls(toolCalls, context) {
        if (!this.toolExecutor) {
            return toolCalls.map((tc) => ({
                toolName: tc.name,
                args: tc.arguments,
                result: {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    result: { success: false, error: 'No tool executor configured', duration: 0 },
                },
            }));
        }
        const results = [];
        for (const tc of toolCalls) {
            this.eventStream.append({
                type: 'tool_call_requested',
                call: { tool: tc.name, args: tc.arguments },
                policy: 'allow',
            });
            const result = await this.toolExecutor.execute(tc.name, tc.arguments, {
                workspaceRoot: this._workspaceRoot,
                sessionId: context.sessionId,
                eventStream: this.eventStream,
            });
            if (result.success && result.data) {
                const outputCheck = (0, prompt_guard_js_1.checkToolOutput)(JSON.stringify(result.data), tc.name);
                if (!outputCheck.safe && outputCheck.confidence > 0.8) {
                    this.logSecurityEvent('tool_output_injection', outputCheck.confidence, outputCheck.flags);
                    result.success = false;
                    result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
                    result.data = undefined;
                }
            }
            const EDIT_TOOLS = new Set(['edit', 'write', 'create_file']);
            if (result.success && EDIT_TOOLS.has(tc.name) && tc.arguments.filePath) {
                try {
                    const lintResult = await this.linter.lintFile(tc.arguments.filePath);
                    if (!lintResult.passed && lintResult.errors.length > 0) {
                        this.eventStream.append({
                            type: 'lint_warning',
                            tool: tc.name,
                            file: tc.arguments.filePath,
                            errors: lintResult.errors,
                        });
                    }
                }
                catch {
                    // Lint is best-effort
                }
            }
            results.push({
                toolName: tc.name,
                args: tc.arguments,
                result: {
                    toolCallId: tc.id,
                    toolName: tc.name,
                    result,
                },
            });
        }
        return results;
    }
    buildToolResultMessages(originalMessages, llmResponse, toolResults) {
        const messages = [...originalMessages];
        messages.push({
            role: 'assistant',
            content: llmResponse.content,
        });
        const TOOL_OUTPUT_MAX_CHARS = 8000;
        for (const tr of toolResults) {
            let dataStr = tr.result.result.data ? JSON.stringify(tr.result.result.data) : '';
            if (dataStr.length > TOOL_OUTPUT_MAX_CHARS) {
                dataStr = dataStr.slice(0, TOOL_OUTPUT_MAX_CHARS) + '\n... [truncated]';
            }
            messages.push({
                role: 'tool',
                content: JSON.stringify({
                    toolCallId: tr.result.toolCallId,
                    toolName: tr.toolName,
                    success: tr.result.result.success,
                    data: dataStr,
                    error: tr.result.result.error,
                }),
            });
        }
        return messages;
    }
}
exports.SessionOrchestrator = SessionOrchestrator;
//# sourceMappingURL=session-orchestrator.js.map