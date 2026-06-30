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
const output_sanitizer_js_1 = require("./coordinator/output-sanitizer.js");
/**
 * Cross-mode validation: which presets are valid for each mode.
 * Invalid combinations are wasteful (e.g. ask + fusion burns tokens for zero benefit).
 * 'auto' preset bypasses this validation since it self-selects.
 */
const VALID_MODE_PRESET_COMBOS = {
    ask: ['solo'],
    plan: ['solo', 'duo'],
    code: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'],
    debug: ['auto', 'solo', 'duo', 'trio', 'fusion', 'swarm'],
    review: ['auto', 'duo', 'trio', 'fusion', 'swarm'],
    oal: ['solo'],
    auto: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'],
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
/**
 * Default prompt-cache directive used for every LLM call dispatched by
 * the orchestrator. The system-prompt prefix is identical across calls
 * for a given role, so attaching a 5-minute ephemeral cache breakpoint
 * maximizes cache hit rate without leaking the prompt to long-lived
 * caches.
 */
const DEFAULT_CACHE_CONTROL = { type: 'ephemeral', ttl: '5m' };
// P0.6 — Tool output truncation caps. Whichever limit is hit first wins.
const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;
const TOOL_OUTPUT_MAX_LINES = 200;
const TOOL_OUTPUT_TRUNCATION_MARKER = '\n\n[... truncated, see event log for full output ...]';
// P0.7 — RelayRacing observation-masking caps, mirrored from
// @chimera/context. Inlined here to avoid a new package dependency
// (chimera-core does not depend on @chimera/context).
const MASK_OUTPUT_LIMIT = 200;
const MASK_ARGS_LIMIT = 100;
/** 5-minute hard cap on a single execute() invocation. */
const EXECUTE_TIMEOUT_MS = 60_000 * 5;
const AbortSignalAny = AbortSignal.any;
const AbortSignalTimeout = AbortSignal.timeout;
/**
 * Compose multiple AbortSignals into one. Prefers AbortSignal.any (Node 20.3+ /
 * Node 22+); falls back to a small AbortController bridge so older runtimes
 * still get a working "abort when any source aborts" semantic.
 */
function composeAbortSignals(signals) {
    const filtered = signals.filter((s) => s !== undefined);
    if (filtered.length === 0)
        return new AbortController().signal;
    if (filtered.length === 1)
        return filtered[0];
    if (typeof AbortSignalAny === 'function')
        return AbortSignalAny(filtered);
    const ac = new AbortController();
    for (const s of filtered) {
        if (s.aborted) {
            ac.abort(s.reason);
            break;
        }
        s.addEventListener('abort', () => ac.abort(s.reason), { once: true });
    }
    return ac.signal;
}
/** Build a timeout signal, preferring AbortSignal.timeout (Node 20.3+). */
function buildTimeoutSignal(ms) {
    if (typeof AbortSignalTimeout === 'function')
        return AbortSignalTimeout(ms);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`aborted after ${ms}ms`)), ms);
    // Avoid keeping the event loop alive just for the timer.
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    return ac.signal;
}
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
    // P0.7 — relay-racing observation masking. Inlined here (rather than
    // importing RelayRacing from @chimera/context) because chimera-core does
    // not depend on @chimera/context. The class is small enough that
    // mirroring its behavior is cheaper than adding a new package edge.
    maskedObservations = new Map();
    maskedTokensSaved = 0;
    workflowExecutor = null;
    _sessionId = `session-${Date.now()}`;
    _writerMessages = [];
    _registry = null;
    autoExtract = null;
    recallService = null;
    autoDream = null;
    _extractionCursor = 0;
    toolCallHistory = [];
    _lastComplexity = null;
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
            messages: [...this._writerMessages],
            toolCallHistory: this.toolCallHistory.slice(-100),
            events,
            costSpend: Object.fromEntries([...this.costTracker.spend.entries()]),
            metadata: {
                agentCount: events.filter((e) => e.type === 'agent_spawned').length,
                turnCount: events.filter((e) => e.type === 'draft_proposed').length,
                status: this.state.status === 'error' ? 'failed' : this.state.status === 'complete' ? 'completed' : 'active',
                auditLogSize: this.auditLog.size(),
                lastComplexity: this._lastComplexity,
            },
        };
    }
    async restoreState(checkpoint) {
        if (checkpoint.messages && Array.isArray(checkpoint.messages)) {
            this._writerMessages = [...checkpoint.messages];
        }
        if (checkpoint.toolCallHistory && Array.isArray(checkpoint.toolCallHistory)) {
            this.toolCallHistory = [...checkpoint.toolCallHistory];
        }
        if (checkpoint.metadata?.lastComplexity) {
            this._lastComplexity = checkpoint.metadata.lastComplexity;
        }
        if (checkpoint.events && Array.isArray(checkpoint.events)) {
            for (const event of checkpoint.events) {
                this.eventStream.append(event);
            }
        }
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
        const { task, mode, providers, preset, costCap = 10, conversationHistory } = params;
        const outputs = [];
        let totalCost = 0;
        // Single per-execute AbortController. Composed with a 5-minute hard
        // timeout so a misbehaving LLM cannot wedge a session forever. The
        // same signal is passed to every LLM call and every tool execution
        // so we can cancel in-flight work when the reviewer returns PASS
        // (no challenger output needed) or when the tool loop hits its
        // iteration cap.
        const ac = new AbortController();
        const executeSignal = composeAbortSignals([ac.signal, buildTimeoutSignal(EXECUTE_TIMEOUT_MS)]);
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
                this.logSecurityEvent('prompt_injection_detected', injectionCheck.confidence, injectionCheck.flags, { type: 'injection', decision: 'block', payload: task });
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
            this._lastComplexity = complexity;
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
            const needsVerification = this.shouldVerify(resolvedMode, complexity, task);
            const writerId = nextAgentId();
            this.transition({ status: 'drafting', task, agentId: writerId });
            this.agentMesh.registerAgent(this.buildAgentConfig(writerId, 'writer', costCap));
            const toolDefs = this.buildToolDefinitions();
            const writerMessages = this.buildWriterPrompt(task, resolvedMode, conversationHistory);
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
                cacheControl: DEFAULT_CACHE_CONTROL,
                signal: executeSignal,
            });
            let draftCost = this.estimateCost(draftResult.usage, providers.writer);
            totalCost += draftCost;
            this.costTracker.recordSpend('writer', draftCost);
            this.logLLMCall('writer', draftResult.usage?.inputTokens ?? 0, draftResult.usage?.outputTokens ?? 0, draftCost, { role: 'writer' });
            this.toolCallHistory = [];
            let iterations = 0;
            this._writerMessages = [...writerMessages];
            while (draftResult.toolCalls && draftResult.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
                iterations++;
                const toolResults = await this.executeToolCalls(draftResult.toolCalls, { sessionId: writerId }, executeSignal);
                this.toolCallHistory.push(...toolResults.map(tr => ({ toolName: tr.toolName, args: tr.args, result: tr.result.result })));
                for (const tr of toolResults) {
                    this.logToolCall(tr.toolName, JSON.stringify(tr.args).slice(0, 100), tr.result.result.duration * 0.000001, { duration: tr.result.result.duration });
                }
                const toolMessages = this.buildToolResultMessages(writerMessages, draftResult, toolResults);
                const inputTokens = (draftResult.usage?.inputTokens ?? 0) + (draftResult.usage?.outputTokens ?? 0);
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
                    cacheControl: DEFAULT_CACHE_CONTROL,
                    signal: executeSignal,
                });
                const iterCost = this.estimateCost(draftResult.usage, providers.writer);
                draftCost += iterCost;
                totalCost += iterCost;
                this.costTracker.recordSpend('writer', iterCost);
                this.logLLMCall('writer', draftResult.usage.inputTokens, draftResult.usage.outputTokens, iterCost, { role: 'writer' });
            }
            const draftParsed = this.parseJSON(draftResult.content);
            const draftContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(draftParsed.response ?? draftResult.content);
            const draftConfidence = draftParsed.confidence ?? 0.5;
            this._writerMessages.push({ role: 'assistant', content: draftContent });
            outputs.push({
                agentId: writerId,
                role: 'writer',
                content: draftContent,
                confidence: draftConfidence,
                provider: 'llm',
                model: 'default',
                tokensUsed: (draftResult.usage?.inputTokens ?? 0) + (draftResult.usage?.outputTokens ?? 0),
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
            const reviewerMessages = this.buildReviewerPrompt(task, draftContent, resolvedMode, conversationHistory);
            const reviewResult = await providers.reviewer.complete(reviewerMessages, {
                temperature: 0.2,
                maxTokens: 4096,
                responseFormat: 'json_object',
                cacheControl: DEFAULT_CACHE_CONTROL,
                signal: executeSignal,
            });
            const reviewCost = this.estimateCost(reviewResult.usage, providers.reviewer);
            totalCost += reviewCost;
            this.costTracker.recordSpend('reviewer', reviewCost);
            this.logLLMCall('reviewer', reviewResult.usage?.inputTokens ?? 0, reviewResult.usage?.outputTokens ?? 0, reviewCost, { role: 'reviewer' });
            const reviewParsed = this.parseJSON(reviewResult.content);
            const verdict = reviewParsed.verdict ?? 'PASS';
            const findings = reviewParsed.findings ?? [];
            outputs.push({
                agentId: reviewerId,
                role: 'reviewer',
                content: (0, output_sanitizer_js_1.sanitizeReviewerOutput)(reviewResult.content),
                confidence: reviewParsed.confidence ?? 0.5,
                provider: 'llm',
                model: 'default',
                tokensUsed: (reviewResult.usage?.inputTokens ?? 0) + (reviewResult.usage?.outputTokens ?? 0),
                issues: findings,
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
                const challengerMessages = this.buildChallengerPrompt(task, draftContent, reviewResult.content, conversationHistory);
                const challengeResult = await providers.challenger.complete(challengerMessages, {
                    temperature: 0.5,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                    cacheControl: DEFAULT_CACHE_CONTROL,
                    signal: executeSignal,
                });
                const challengeCost = this.estimateCost(challengeResult.usage, providers.challenger);
                totalCost += challengeCost;
                this.costTracker.recordSpend('challenger', challengeCost);
                this.logLLMCall('challenger', challengeResult.usage?.inputTokens ?? 0, challengeResult.usage?.outputTokens ?? 0, challengeCost, { role: 'challenger' });
                const challengeParsed = this.parseJSON(challengeResult.content);
                outputs.push({
                    agentId: challengerId,
                    role: 'challenger',
                    content: challengeParsed.response ?? challengeResult.content,
                    confidence: challengeParsed.confidence ?? 0.5,
                    provider: 'llm',
                    model: 'default',
                    tokensUsed: (challengeResult.usage?.inputTokens ?? 0) + (challengeResult.usage?.outputTokens ?? 0),
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
                output: `Error: ${message}`,
            });
            return { status: 'error', output: `Error: ${message}`, cost: totalCost, agentCount: outputs.length, events: [...this.eventStream.getAll()] };
        }
        finally {
            // Ensure we never leak a pending timeout signal. The AbortController
            // is single-use and any future readers of executeSignal would see
            // the already-aborted state.
            ac.abort('execute-finished');
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
                // Complexity-gated selection: trivial → solo, medium → duo, complex → trio, very complex → fusion
                if (!complexity)
                    return 'trio'; // fallback when no complexity available
                if (complexity.overall < 0.3)
                    return 'solo'; // trivial: single model
                if (complexity.overall < 0.6)
                    return 'duo'; // medium: two models
                if (complexity.overall >= 0.8)
                    return 'fusion'; // high-stakes: multi-model deliberation
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
        // Override to fusion when task explicitly requests multi-model deliberation
        if (delibMode !== 'fusion' && !preset) {
            const lower = task.toLowerCase();
            const fusionKeywords = ['compare', 'debate', 'perspectives', 'alternatives', 'tradeoffs', 'consensus'];
            if (fusionKeywords.some((k) => lower.includes(k))) {
                return { ...base, mode: 'fusion', analysisModels: ['default'], judgeModel: 'default' };
            }
        }
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
            case 'fusion': {
                const modelIds = this._registry
                    ? this._registry.getAll()
                        .filter((m) => !m.deprecated)
                        .map((m) => m.id)
                    : ['default'];
                const panel = modelIds.slice(0, 3);
                const judge = modelIds[modelIds.length - 1] ?? 'default';
                return { ...base, mode: 'fusion', analysisModels: panel, judgeModel: judge };
            }
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
    /**
     * Run the reviewer step: build the prompt, call the provider, parse
     * the structured verdict, register the agent in the mesh, and record
     * the cost.
     */
    async runReviewer(args) {
        this.transition({ status: 'verifying', task: args.task, draft: args.draft, agentId: args.reviewerId });
        this.agentMesh.registerAgent(this.buildAgentConfig(args.reviewerId, 'reviewer', args.costCap));
        const reviewerMessages = this.buildReviewerPrompt(args.task, args.draft, args.mode, args.conversationHistory);
        const reviewResult = await args.reviewer.complete(reviewerMessages, {
            temperature: 0.2,
            maxTokens: 4096,
            responseFormat: 'json_object',
            signal: args.signal,
        });
        const reviewCost = this.estimateCost(reviewResult.usage, args.reviewer);
        this.costTracker.recordSpend('reviewer', reviewCost);
        const reviewParsed = this.parseJSON(reviewResult.content);
        const verdict = reviewParsed.verdict ?? 'PASS';
        const findings = reviewParsed.findings ?? [];
        const reviewSummary = this.buildReviewerSummary(verdict, findings, reviewParsed.thought);
        return {
            verdict,
            confidence: reviewParsed.confidence ?? 0.5,
            findings,
            reviewSummary,
            reviewContent: reviewResult.content,
            reviewTokens: (reviewResult.usage?.inputTokens ?? 0) + (reviewResult.usage?.outputTokens ?? 0),
        };
    }
    /**
     * Run the challenger step: build the prompt, call the provider,
     * parse the structured output, register the agent in the mesh, and
     * record the cost.
     */
    async runChallenger(args) {
        this.transition({
            status: 'challenging',
            task: args.task,
            draft: args.draft,
            review: args.review,
            agentId: args.challengerId,
        });
        this.agentMesh.registerAgent(this.buildAgentConfig(args.challengerId, 'challenger', args.costCap));
        const challengerMessages = this.buildChallengerPrompt(args.task, args.draft, args.review, args.conversationHistory);
        const challengeResult = await args.challenger.complete(challengerMessages, {
            temperature: 0.5,
            maxTokens: 4096,
            responseFormat: 'json_object',
            signal: args.signal,
        });
        const challengeCost = this.estimateCost(challengeResult.usage, args.challenger);
        this.costTracker.recordSpend('challenger', challengeCost);
        const challengeParsed = this.parseJSON(challengeResult.content);
        return {
            response: challengeParsed.response ?? challengeResult.content,
            confidence: challengeParsed.confidence ?? 0.5,
            issues: challengeParsed.issues ?? [],
            alternatives: challengeParsed.filesChanged ?? [],
            raw: challengeResult.content,
            rawUsage: challengeResult.usage,
        };
    }
    /**
     * Side-effect helper: push a reviewer result into `outputs` and
     * append the `verified` event.
     */
    processReviewerResult(outputs, reviewerId, data) {
        outputs.push({
            agentId: reviewerId,
            role: 'reviewer',
            content: data.reviewSummary,
            confidence: data.confidence,
            provider: 'llm',
            model: 'default',
            tokensUsed: data.reviewTokens,
            issues: data.findings,
        });
        this.eventStream.append({
            type: 'verified',
            agentId: reviewerId,
            verdict: data.verdict === 'PASS'
                ? 'pass'
                : data.verdict === 'FAIL'
                    ? 'fail'
                    : 'needs_revision',
            findings: data.findings.map((f) => ({
                description: f.description,
                severity: f.severity,
                evidence: f.evidence,
            })),
        });
    }
    /**
     * Side-effect helper: push a challenger result into `outputs` and
     * append the `challenged` event.
     */
    processChallengerResult(outputs, challengerId, data) {
        outputs.push({
            agentId: challengerId,
            role: 'challenger',
            content: data.response,
            confidence: data.confidence,
            provider: 'llm',
            model: 'default',
            tokensUsed: data.rawUsage.inputTokens + data.rawUsage.outputTokens,
        });
        this.eventStream.append({
            type: 'challenged',
            agentId: challengerId,
            challenges: data.issues,
            alternatives: data.alternatives,
        });
    }
    /**
     * Convert a parsed review verdict + findings into a human-readable
     * summary suitable for use as an agent's `content` field.
     */
    buildReviewerSummary(verdict, findings, _thought) {
        if (verdict === 'PASS')
            return '';
        if (findings.length === 0)
            return '';
        const lines = findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.description}`);
        return `Review findings:\n${lines.join('\n')}`;
    }
    /**
     * P0.7 — Apply relay-racing observation masking before the next LLM
     * call. Caps tool/function outputs and trims assistant tool-call
     * signatures so the writer's context window does not fill up on
     * redundant tool noise. Mirrors the behavior of @chimera/context's
     * RelayRacing.maskObservations / RelayRacing.maskToolCalls.
     */
    maskRelayObservations(messages, agentId) {
        const masked = [];
        const result = [];
        for (const msg of messages) {
            if (msg.role === 'tool' || (msg.role === 'assistant' && msg.content.length > MASK_OUTPUT_LIMIT)) {
                const original = msg.content;
                let maskedContent = original;
                let tokensSaved = 0;
                if (original.length > MASK_OUTPUT_LIMIT) {
                    maskedContent = original.slice(0, MASK_OUTPUT_LIMIT) + '\n\n[... masked ...]';
                    tokensSaved = Math.floor((original.length - MASK_OUTPUT_LIMIT) / 4);
                }
                if (maskedContent !== original) {
                    masked.push({ original, masked: maskedContent, tokensSaved });
                    this.maskedTokensSaved += tokensSaved;
                }
                result.push({ role: msg.role, content: maskedContent });
            }
            else {
                result.push(msg);
            }
        }
        if (masked.length > 0) {
            this.maskedObservations.set(agentId, masked);
        }
        return result;
    }
    async executeQualityGateParallel(params) {
        const { task, draft, mode, providers, costCap, conversationHistory } = params;
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
            const reviewerMessages = this.buildReviewerPrompt(task, draft, mode, conversationHistory);
            const result = await providers.reviewer.complete(reviewerMessages, {
                temperature: 0.2,
                maxTokens: 4096,
                responseFormat: 'json_object',
                cacheControl: DEFAULT_CACHE_CONTROL,
            });
            const cost = this.estimateCost(result.usage);
            this.costTracker.recordSpend('reviewer', cost);
            const parsed = this.parseJSON(result.content);
            outputs.push({
                agentId: reviewerId,
                role: 'reviewer',
                content: (0, output_sanitizer_js_1.sanitizeReviewerOutput)(result.content),
                confidence: parsed.confidence ?? 0.5,
                provider: 'llm',
                model: 'default',
                tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
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
                const challengerMessages = this.buildChallengerPrompt(task, draft, '', conversationHistory);
                const result = await challenger.complete(challengerMessages, {
                    temperature: 0.5,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                    cacheControl: DEFAULT_CACHE_CONTROL,
                });
                const cost = this.estimateCost(result.usage, challenger);
                this.costTracker.recordSpend('challenger', cost);
                const parsed = this.parseJSON(result.content);
                outputs.push({
                    agentId: challengerId,
                    role: 'challenger',
                    content: parsed.response ?? result.content,
                    confidence: parsed.confidence ?? 0.5,
                    provider: 'llm',
                    model: 'default',
                    tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
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
    logLLMCall(model, inputTokens, outputTokens, cost, details) {
        this.auditLog.logLLMCall({
            sessionId: this._sessionId,
            model,
            inputTokens,
            outputTokens,
            tokenCost: cost,
            details: {
                ...details,
                tokens: inputTokens + outputTokens,
            },
        });
    }
    logToolCall(tool, paramsHash, cost, details) {
        this.auditLog.logToolCall({
            sessionId: this._sessionId,
            tool,
            paramsHash,
            userApproved: true,
            tokenCost: cost,
            details: {
                toolName: tool,
                decision: 'allow',
                ...details,
            },
        });
    }
    logSecurityEvent(event, confidence, flags, details) {
        this.auditLog.logSecurityEvent({
            sessionId: this._sessionId,
            event,
            confidence,
            flags,
            details: {
                ...details,
            },
        });
    }
    shouldVerify(mode, complexity, task) {
        if (task && task_router_js_1.TaskRouter.isConversationalTask(task))
            return false;
        if (mode === 'ask' && complexity.overall < 0.4)
            return false;
        return true;
    }
    buildWriterPrompt(task, mode, conversationHistory) {
        const messages = (0, prompts_js_1.buildMessages)({ role: 'writer', mode, task, workspaceRoot: this._workspaceRoot, cacheControl: DEFAULT_CACHE_CONTROL });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "filesChanged": string[], "issues": string[], "rationale": string}',
            'The "thought" field must contain your comprehensive Chain-of-Thought reasoning.',
            'The "response" field contains your main output — this is what the user sees.',
            'The "confidence" field is how confident you are (0 = guessing, 1 = certain).',
            'The "filesChanged" field lists any files referenced or modified.',
            'The "rationale" field explains why you chose this approach.',
            '',
            'CRITICAL: For conversational questions (e.g., "what can you do?", "who are you?", "how do I use X?"),',
            'answer directly in the "response" field. Do NOT put analysis, meta-reasoning, or internal',
            'assessment of other agents in the response field. The response field is the user-facing answer.',
            'Analysis like "The original writer draft was empty..." or "The reviewer identified..." belongs',
            'in "thought" only, NEVER in "response".',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        // Insert conversation history between output instructions and current task
        if (conversationHistory && conversationHistory.length > 0) {
            const MAX_HISTORY_TURNS = 10;
            const MAX_HISTORY_CHARS = 32000;
            let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
            let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
            while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
                const removed = historyMessages.shift();
                totalChars -= removed.content.length;
            }
            const historyBlock = [
                '--- PREVIOUS CONVERSATION CONTEXT ---',
                'Use this context to understand what the user has been discussing.',
                'Do NOT repeat information already provided. Build on previous answers.',
                ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
                '--- END PREVIOUS CONVERSATION ---',
                '',
            ].join('\n');
            // Insert before the last message (which is the current task)
            messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
        }
        return messages;
    }
    buildReviewerPrompt(task, draft, mode, conversationHistory) {
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'reviewer',
            mode,
            task: [
                `## Original Task\n${task}`,
                `## Draft Output\n${draft}`,
                '',
                'Evaluate the draft against the task. Return structured JSON.',
            ].join('\n'),
            workspaceRoot: this._workspaceRoot,
            cacheControl: DEFAULT_CACHE_CONTROL,
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "verdict": "PASS" | "FAIL" | "NEEDS_REVISION", "confidence": number 0-1, "findings": Array<{description: string, severity: "high"|"med"|"low", evidence: string}>}',
            'The "thought" field must contain your detailed reasoning and adversarial critique.',
        ];
        if (task_router_js_1.TaskRouter.isConversationalTask(task)) {
            outputInstructions.push('', 'IMPORTANT: This is a conversational/general question, not a code task.', 'Do NOT apply code-review criteria. Evaluate only: accuracy, completeness, clarity.', 'Default to PASS unless the answer is factually incorrect.');
        }
        messages.splice(1, 0, { role: 'system', content: outputInstructions.join('\n') });
        if (conversationHistory && conversationHistory.length > 0) {
            const MAX_HISTORY_TURNS = 10;
            const MAX_HISTORY_CHARS = 32000;
            let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
            let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
            while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
                const removed = historyMessages.shift();
                totalChars -= removed.content.length;
            }
            const historyBlock = [
                '--- PREVIOUS CONVERSATION CONTEXT ---',
                'Use this context to understand what the user has been discussing.',
                ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
                '--- END PREVIOUS CONVERSATION ---',
                '',
            ].join('\n');
            messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
        }
        return messages;
    }
    buildChallengerPrompt(task, draft, review, conversationHistory) {
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
            workspaceRoot: this._workspaceRoot,
            cacheControl: DEFAULT_CACHE_CONTROL,
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "issues": string[], "filesChanged": string[]}',
            'The "thought" field must contain your adversarial reasoning and architectural dissent.',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        if (conversationHistory && conversationHistory.length > 0) {
            const MAX_HISTORY_TURNS = 10;
            const MAX_HISTORY_CHARS = 32000;
            let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
            let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
            while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
                const removed = historyMessages.shift();
                totalChars -= removed.content.length;
            }
            const historyBlock = [
                '--- PREVIOUS CONVERSATION CONTEXT ---',
                'Use this context to understand what the user has been discussing.',
                ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
                '--- END PREVIOUS CONVERSATION ---',
                '',
            ].join('\n');
            messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
        }
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
            // Fallback: try to extract "response" field via regex
            const responseMatch = raw.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (responseMatch) {
                return { response: responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') };
            }
            return {};
        }
    }
    estimateCost(usage, provider) {
        // Provider-truthful path: use the provider's own pricing table so
        // prompt-caching and per-model rates are honored. We compute from
        // `getPricing` rather than `getCost` because `getCost` does not
        // surface the cache rates.
        if (provider && typeof provider.getCost === 'function' && typeof provider.getPricing === 'function') {
            const pricing = provider.getPricing();
            const cacheReadTokens = usage.cacheReadTokens ?? 0;
            const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
            const uncached = Math.max(0, usage.inputTokens - cacheReadTokens);
            const inputCost = (uncached * pricing.inputPerMillion) / 1e6 +
                (cacheReadTokens * (pricing.cacheReadPerMillion ?? pricing.inputPerMillion)) / 1e6 +
                (cacheWriteTokens * (pricing.cacheWritePerMillion ?? pricing.inputPerMillion)) / 1e6;
            const outputCost = (usage.outputTokens * pricing.outputPerMillion) / 1e6;
            return inputCost + outputCost;
        }
        // Fallback: static rates that match the original behavior when no
        // provider hint is available (e.g. MockProvider path or tests that
        // don't pass a provider).
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
    async executeToolCalls(toolCalls, context, signal) {
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
                signal,
            });
            if (result.success && result.data) {
                const outputCheck = (0, prompt_guard_js_1.checkToolOutput)(JSON.stringify(result.data), tc.name);
                if (!outputCheck.safe && outputCheck.confidence > 0.8) {
                    this.logSecurityEvent('tool_output_injection', outputCheck.confidence, outputCheck.flags, { type: 'injection', decision: 'sanitize', payload: JSON.stringify(result.data) });
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
        const assistantMsg = {
            role: 'assistant',
            content: llmResponse.content,
        };
        if (llmResponse.toolCalls?.length) {
            assistantMsg.tool_calls = llmResponse.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) },
            }));
        }
        messages.push(assistantMsg);
        const TOOL_OUTPUT_MAX_CHARS = 8000;
        for (const tr of toolResults) {
            let dataStr = tr.result.result.data ? JSON.stringify(tr.result.result.data) : '';
            if (dataStr.length > TOOL_OUTPUT_MAX_CHARS) {
                dataStr = dataStr.slice(0, TOOL_OUTPUT_MAX_CHARS) + '\n... [truncated]';
            }
            messages.push({
                role: 'tool',
                tool_call_id: tr.result.toolCallId,
                content: JSON.stringify({
                    toolCallId: tr.result.toolCallId,
                    toolName: tr.toolName,
                    success: tr.result.result.success,
                    data: dataStr,
                    error: tr.result.result.error,
                }),
            });
        }
        messages.push({
            role: 'user',
            content: '[!] #TOOL RESULTS RECEIVED# [!]\n' +
                'The tools above have returned their results. Now you MUST synthesize a final response.\n\n' +
                'RULES:\n' +
                '1. DO NOT echo or repeat the raw tool output.\n' +
                '2. Summarize the key findings in natural language.\n' +
                '3. Return your answer as JSON: {"thought": "...", "response": "...", "confidence": 0.0-1.0}\n' +
                '4. The "response" field is what the user will see — make it clear, concise, and helpful.\n' +
                '5. If the tool failed, explain what went wrong and suggest alternatives.',
        });
        return messages;
    }
}
exports.SessionOrchestrator = SessionOrchestrator;
//# sourceMappingURL=session-orchestrator.js.map