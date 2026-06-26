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
    _workspaceRoot;
    constructor(eventStream, tools, workspaceRoot, memory) {
        this.eventStream = eventStream ?? new event_stream_js_1.EventStream();
        this.costTracker = new cost_tracker_js_1.CostTracker(this.eventStream);
        this.taskRouter = new task_router_js_1.TaskRouter(this.eventStream);
        this.agentMesh = new agent_mesh_js_1.AgentMesh(this.eventStream);
        this.synthesizer = new response_synthesizer_js_1.ResponseSynthesizer(this.eventStream);
        this._workspaceRoot = workspaceRoot ?? process.cwd();
        this.memory = memory ?? null;
        if (tools) {
            this.toolRegistry = tools.registry;
            this.toolExecutor = tools.executor;
        }
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
    /**
     * Export current session state for persistence.
     */
    exportState(sessionId, task, mode) {
        const events = [...this.eventStream.getAll()];
        return {
            sessionId,
            timestamp: new Date().toISOString(),
            task,
            mode,
            messages: [],
            events,
            costSpend: {},
            metadata: {
                agentCount: 0,
                turnCount: 0,
                status: this.state.status === 'error' ? 'failed' : this.state.status === 'complete' ? 'completed' : 'active',
            },
        };
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
        const { task, mode, providers, costCap = 10 } = params;
        const outputs = [];
        let totalCost = 0;
        try {
            this.eventStream.append({ type: 'user_request', text: task, mode });
            // Security check: scan user input for injection attempts
            const injectionCheck = (0, prompt_guard_js_1.checkUserInput)(task);
            if (!injectionCheck.safe && injectionCheck.confidence > 0.85) {
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
            // Memory retrieval: get relevant long-term memories
            let memoryContext = '';
            if (this.memory) {
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
                catch {
                    // Memory retrieval failure is non-fatal
                }
            }
            // Stage 1: Classify
            this.transition({ status: 'classifying', task });
            const complexity = this.taskRouter.classifyTask(task);
            // Stage 2: Plan — decide whether to skip verification for simple ask-mode tasks
            this.transition({ status: 'planning', task, complexity });
            const needsVerification = this.shouldVerify(mode, complexity);
            // Stage 3: Draft (with tool loop)
            const writerId = nextAgentId();
            this.transition({ status: 'drafting', task, agentId: writerId });
            this.agentMesh.registerAgent(this.buildAgentConfig(writerId, 'writer', costCap));
            const toolDefs = this.buildToolDefinitions();
            const writerMessages = this.buildWriterPrompt(task, mode);
            let draftResult = await providers.writer.complete(writerMessages, {
                temperature: 0.7,
                maxTokens: 4096,
                responseFormat: 'json_object',
                tools: toolDefs.length > 0 ? toolDefs : undefined,
            });
            let draftCost = this.estimateCost(draftResult.usage);
            totalCost += draftCost;
            this.costTracker.recordSpend('writer', draftCost);
            // Tool loop: execute tool calls until LLM stops calling tools
            const toolCallHistory = [];
            let iterations = 0;
            while (draftResult.toolCalls && draftResult.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
                iterations++;
                const toolResults = await this.executeToolCalls(draftResult.toolCalls, { sessionId: writerId });
                toolCallHistory.push(...toolResults);
                // Append tool results to messages and re-prompt
                const toolMessages = this.buildToolResultMessages(writerMessages, draftResult, toolResults);
                draftResult = await providers.writer.complete(toolMessages, {
                    temperature: 0.7,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                    tools: toolDefs.length > 0 ? toolDefs : undefined,
                });
                const iterCost = this.estimateCost(draftResult.usage);
                draftCost += iterCost;
                totalCost += iterCost;
                this.costTracker.recordSpend('writer', iterCost);
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
                return this.finalize('done', outputs, totalCost, task, mode);
            }
            // Stage 4: Verify
            const reviewerId = nextAgentId();
            this.transition({ status: 'verifying', task, draft: draftContent, agentId: reviewerId });
            this.agentMesh.registerAgent(this.buildAgentConfig(reviewerId, 'reviewer', costCap));
            const reviewerMessages = this.buildReviewerPrompt(task, draftContent, mode);
            const reviewResult = await providers.reviewer.complete(reviewerMessages, {
                temperature: 0.2,
                maxTokens: 4096,
                responseFormat: 'json_object',
            });
            const reviewCost = this.estimateCost(reviewResult.usage);
            totalCost += reviewCost;
            this.costTracker.recordSpend('reviewer', reviewCost);
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
            // Stage 5: Challenge (optional — only if challenger provided and reviewer flagged issues)
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
                const challengerMessages = this.buildChallengerPrompt(task, draftContent, reviewResult.content);
                const challengeResult = await providers.challenger.complete(challengerMessages, {
                    temperature: 0.5,
                    maxTokens: 4096,
                    responseFormat: 'json_object',
                });
                const challengeCost = this.estimateCost(challengeResult.usage);
                totalCost += challengeCost;
                this.costTracker.recordSpend('challenger', challengeCost);
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
                // If challenger and reviewer both flagged, escalate to needs_user
                if (verdict === 'FAIL') {
                    return this.finalize('needs_user', outputs, totalCost, task, mode);
                }
            }
            // Stage 6: Synthesize
            return this.finalize('done', outputs, totalCost, task, mode);
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
    finalize(status, outputs, totalCost, task, mode) {
        const synthesis = this.synthesizer.synthesize(this.toSynthesisInputs(outputs));
        const resolvedStatus = synthesis.needsUserEscalation ? 'needs_user' : status;
        this.transition({ status: 'complete', result: synthesis.unifiedResponse, cost: totalCost });
        this.eventStream.append({
            type: 'final_response',
            status: resolvedStatus === 'error' ? 'blocked' : resolvedStatus,
            cost: totalCost,
            agentCount: outputs.length,
        });
        // Store task result in long-term memory (fire-and-forget)
        if (this.memory && resolvedStatus === 'done' && task && mode) {
            this.memory.write({
                content: `Task: ${task}\nResult: ${synthesis.unifiedResponse.slice(0, 500)}`,
                topic: mode,
                importance: 0.6,
                source: 'user',
                tags: [mode, 'task-result'],
            }).catch(() => { }); // Non-fatal
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
            // Check tool output for injection attempts
            if (result.success && result.data) {
                const outputCheck = (0, prompt_guard_js_1.checkToolOutput)(JSON.stringify(result.data), tc.name);
                if (!outputCheck.safe && outputCheck.confidence > 0.8) {
                    result.success = false;
                    result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
                    result.data = undefined;
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
        // Add assistant message with tool calls
        messages.push({
            role: 'assistant',
            content: llmResponse.content,
        });
        // Add tool results as user messages
        for (const tr of toolResults) {
            messages.push({
                role: 'tool',
                content: JSON.stringify({
                    toolCallId: tr.result.toolCallId,
                    toolName: tr.toolName,
                    success: tr.result.result.success,
                    data: tr.result.result.data,
                    error: tr.result.result.error,
                }),
            });
        }
        return messages;
    }
}
exports.SessionOrchestrator = SessionOrchestrator;
//# sourceMappingURL=session-orchestrator.js.map