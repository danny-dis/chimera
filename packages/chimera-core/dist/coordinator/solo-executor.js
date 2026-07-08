"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoloExecutor = void 0;
const fs_1 = require("fs");
const zod_json_js_1 = require("../zod-json.js");
const output_sanitizer_js_1 = require("./output-sanitizer.js");
const task_router_js_1 = require("../task-router.js");
const tool_execution_helper_js_1 = require("./tool-execution-helper.js");
/**
 * System prompt injected for `code` / tool-driven tasks. Small instruction-
 * following models (e.g. 8B) will otherwise narrate what files they "would"
 * create instead of actually calling write_file. This forces action.
 */
const CODE_MODE_PROMPT = `You are an autonomous coding agent operating inside a real workspace.

CRITICAL EXECUTION RULES:
- You MUST accomplish the task by CALLING TOOLS (write_file, read_file, run_shell_command, websearch, webfetch). Do NOT describe files in prose or claim you created them without actually calling write_file.
- NEVER end your turn with a summary like "I created file X" unless you have actually called write_file for X in this conversation.
- Use relative paths. The current working directory IS the workspace root.
- When the task lists multiple files, call write_file once per file, across as many turns as needed.
- After every tool result, continue calling tools until the task is fully complete. Only produce a final closing message once ALL files are written.
- If a tool call fails, read the error and retry with corrected arguments.

RESEARCH BEFORE WRITING:
- If the task involves unfamiliar libraries, current APIs, or best practices, call websearch FIRST to gather facts, then write code from what you learned. Do not rely on memory alone for anything you are unsure about.
- If you have a known documentation URL, use webfetch to pull its contents.`;
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
    workspaceRoot;
    toolExecutor;
    toolRegistry;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
        this.workspaceRoot = deps.workspaceRoot;
        this.toolExecutor = deps.toolExecutor;
        this.toolRegistry = deps.toolRegistry;
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
            // For tool-driven (code) tasks, force an agentic system prompt so the
            // model actually invokes tools instead of narrating a plan in prose.
            const writerConfig = this.toolRegistry
                ? { ...config, systemPrompt: [CODE_MODE_PROMPT, config.systemPrompt].filter(Boolean).join('\n\n') }
                : config;
            const res = await this.callPeer('writer', config.model, task, writerConfig, providerFactory, undefined, thought, this.toolRegistry ? this.listToolDefs() : undefined);
            draftContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(res.content);
            totalTokens += res.inputTokens + res.outputTokens;
            const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
            totalCostUsd += cost;
            this.recordSpend(config.model, cost);
            // ── Multi-round tool execution loop ──────────────────────────
            // Small models often stop after one tool batch (e.g. they research with
            // websearch then emit a summary instead of writing). Loop up to maxDepth
            // turns so the writer can read→write→continue until the task is done.
            let currentToolCalls = res.toolCalls;
            let lastContent = res.content;
            const MAX_TOOL_ROUNDS = Math.max(1, config.maxDepth ?? 4);
            let round = 0;
            let wroteFileCount = 0;
            while (currentToolCalls &&
                currentToolCalls.length > 0 &&
                this.toolExecutor &&
                this.workspaceRoot &&
                round < MAX_TOOL_ROUNDS) {
                round++;
                const toolResults = await (0, tool_execution_helper_js_1.runToolCalls)({
                    toolCalls: currentToolCalls,
                    toolExecutor: this.toolExecutor,
                    toolRegistry: this.toolRegistry,
                    eventStream: this.eventStream,
                    workspaceRoot: this.workspaceRoot,
                    sessionId: `solo-${config.model}`,
                });
                for (const tc of currentToolCalls) {
                    if (tc.name === 'write_file')
                        wroteFileCount++;
                }
                const provider = providerFactory(config.model);
                try {
                    const followUp = await this.followUpWithToolResults(provider, config, lastContent, currentToolCalls, toolResults, wroteFileCount);
                    lastContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(followUp.content);
                    totalTokens += followUp.inputTokens + followUp.outputTokens;
                    const followUpCost = this.computeCost(config.model, followUp.inputTokens, followUp.outputTokens);
                    totalCostUsd += followUpCost;
                    this.recordSpend(config.model, followUpCost);
                    // Continue looping if the model emitted more tool calls.
                    currentToolCalls = followUp.toolCalls ?? [];
                }
                catch {
                    currentToolCalls = [];
                }
            }
            // Harness-level guard (ground-truth on disk, not tool-call counts).
            // Small models sometimes write ONE file then dump the rest as markdown
            // in their final message — wroteFileCount would be >0 and the old guard
            // stayed silent, leaving a broken project. Here we count ACTUAL source
            // files on disk and, for any task that wants creation, keep forcing
            // write turns until enough real files exist (or we hit a retry cap).
            const wantsFiles = /\b(create|scaffold|write|generate|build|implement|make|port|add)\b/i.test(task) ||
                /write_file|Cargo\.toml|src\/|\.rs|\.ts|\.toml|\.json|\.md/i.test(task);
            const FORCE_MIN_FILES = 3; // a multi-file scaffold must land ≥ this many source files
            if (wantsFiles && this.toolExecutor && this.workspaceRoot && round > 0) {
                const countSourceFiles = (dir) => {
                    if (!(0, fs_1.existsSync)(dir))
                        return 0;
                    let n = 0;
                    for (const entry of (0, fs_1.readdirSync)(dir)) {
                        if (entry === 'target' || entry === 'node_modules' || entry === '.git' ||
                            entry === '.chimera' || entry.startsWith('.'))
                            continue;
                        const full = `${dir}/${entry}`;
                        try {
                            if ((0, fs_1.statSync)(full).isDirectory())
                                n += countSourceFiles(full);
                            else if (/\.(rs|ts|toml|json|md|ya?ml|lock)$/.test(entry))
                                n++;
                        }
                        catch { /* ignore unreadable */ }
                    }
                    return n;
                };
                let realFiles = countSourceFiles(this.workspaceRoot);
                let forceAttempts = 0;
                const MAX_FORCE = 3;
                while (realFiles < FORCE_MIN_FILES && forceAttempts < MAX_FORCE) {
                    forceAttempts++;
                    try {
                        const forceProvider = providerFactory(config.model);
                        const forced = await this.forceWriteTurn(forceProvider, config, lastContent, task);
                        lastContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(forced.content);
                        totalTokens += forced.inputTokens + forced.outputTokens;
                        const forcedCost = this.computeCost(config.model, forced.inputTokens, forced.outputTokens);
                        totalCostUsd += forcedCost;
                        this.recordSpend(config.model, forcedCost);
                        if (forced.toolCalls && forced.toolCalls.length > 0) {
                            // Re-count write_file calls for accurate reporting.
                            for (const tc of forced.toolCalls) {
                                if (tc.name === 'write_file')
                                    wroteFileCount++;
                            }
                            await (0, tool_execution_helper_js_1.runToolCalls)({
                                toolCalls: forced.toolCalls,
                                toolExecutor: this.toolExecutor,
                                toolRegistry: this.toolRegistry,
                                eventStream: this.eventStream,
                                workspaceRoot: this.workspaceRoot,
                                sessionId: `solo-${config.model}`,
                            });
                        }
                        realFiles = countSourceFiles(this.workspaceRoot);
                    }
                    catch {
                        /* best-effort; do not crash the run */
                    }
                }
            }
            // If the model never produced a usable closing message but tools ran,
            // synthesize a summary so the run still completes as `done`.
            if ((!draftContent || draftContent.trim().length === 0) && round > 0) {
                draftContent = lastContent || 'Task executed via tools.';
            }
            else if (round > 0) {
                draftContent = lastContent || draftContent;
            }
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
            reviewContent = (0, output_sanitizer_js_1.sanitizeReviewerOutput)(res.content);
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
        // The reviewer may produce meta-analysis (verdict/findings) rather
        // than a user-facing answer. Pick whichever response is actually
        // useful to the user.
        const finalResponse = this.chooseBestResponse(draftContent, reviewContent);
        const analysis = {
            thought,
            finalResponse,
            consensus: [draftContent],
            conflicts: [],
            uniqueInsights: [reviewContent],
            blindSpots: [],
            confidence: 0.9, // Higher confidence after self-correction
        };
        this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount: config.eternalCoT ? 3 : 2, output: finalResponse });
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
    async callPeer(role, modelId, task, config, providerFactory, draft, thought, tools) {
        const start = Date.now();
        const provider = providerFactory(modelId);
        let prompt;
        switch (role) {
            case 'thinker':
                prompt = this.buildThinkPrompt(task, config.context);
                break;
            case 'writer':
                prompt = this.buildDraftPrompt(task, thought, config.isConversational, config.context);
                break;
            case 'reviewer':
                prompt = this.buildReviewPrompt(task, draft, config.isConversational, config.context);
                break;
        }
        const messages = [];
        if (config.systemPrompt) {
            messages.push({ role: 'system', content: config.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        const r = await provider.complete(messages, { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(tools ? { tools, toolChoice: 'auto' } : {}), ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
        return {
            content: r.content,
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
            durationMs: Date.now() - start,
            toolCalls: r.toolCalls,
        };
    }
    /**
     * Resolve tool definitions from the registry into the shape `provider.complete`
     * expects. Returns `[]` when no registry is available.
     */
    listToolDefs() {
        if (!this.toolRegistry)
            return [];
        const out = [];
        for (const t of this.toolRegistry.getAll()) {
            let parameters = { type: 'object', properties: {} };
            try {
                parameters = (0, zod_json_js_1.zodToJsonSchema)(t.parameters);
            }
            catch {
                // A malformed tool schema must not break the entire run; fall back
                // to an empty object schema so the model can still attempt the call.
            }
            out.push({ name: t.name, description: t.description, parameters });
        }
        return out;
    }
    /**
     * Feed tool results back to the writer for one follow-up turn. Mirrors the
     * orchestrator's `buildToolResultMessages` contract: an assistant message
     * carrying the tool_calls, followed by one `tool` message per call.
     */
    async followUpWithToolResults(provider, config, assistantContent, toolCalls, toolResults, wroteFileCount = 0) {
        const messages = [];
        if (config.systemPrompt) {
            messages.push({ role: 'system', content: config.systemPrompt });
        }
        messages.push({
            role: 'assistant',
            content: assistantContent,
            toolCalls: toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
            })),
        });
        for (const tr of toolResults) {
            messages.push({
                role: 'tool',
                content: JSON.stringify(tr.result.result),
                toolResultId: tr.result.toolCallId,
            });
        }
        // If the model has researched/read but not yet created any files, escalate
        // the instruction so small models actually transition to writing.
        const nudge = wroteFileCount === 0
            ? 'You have NOT created any files yet. The task requires you to CREATE files. Call write_file NOW for each file the task lists — do not summarize or explain, just write the files.'
            : 'Continue. Incorporate the tool results and finish the task.';
        messages.push({ role: 'user', content: nudge });
        const r = await provider.complete(messages, {
            temperature: config.temperature,
            maxTokens: config.maxCompletionTokens,
            ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}),
        });
        return {
            content: r.content,
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
            toolCalls: r.toolCalls,
        };
    }
    /**
     * Last-resort harness nudge: when the model researched/summarized but never
     * wrote a single file on a task that clearly wants files, send one explicit
     * turn that demands write_file calls, then execute whatever it emits.
     */
    async forceWriteTurn(provider, config, lastContent, task) {
        const messages = [];
        if (config.systemPrompt) {
            messages.push({ role: 'system', content: config.systemPrompt });
        }
        messages.push({
            role: 'user',
            content: `Your previous response did not create any files. The task REQUIRES you to create files on disk. ` +
                `Re-read the task and immediately call write_file for EVERY file it lists, using the exact relative paths. ` +
                `Do not describe or summarize — produce the tool calls now.\n\nTASK: ${task}\n\nPREVIOUS OUTPUT (for reference, do not copy):\n${lastContent.slice(0, 2000)}`,
        });
        const r = await provider.complete(messages, {
            temperature: config.temperature,
            maxTokens: config.maxCompletionTokens,
            tools: this.listToolDefs(),
            ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}),
        });
        return {
            content: r.content,
            inputTokens: r.usage?.inputTokens ?? 0,
            outputTokens: r.usage?.outputTokens ?? 0,
            toolCalls: r.toolCalls,
        };
    }
    buildThinkPrompt(task, context) {
        const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
        return `You are a strategic thinker. Analyze the following task and plan your approach. Identify potential pitfalls and best practices. Do not provide the final answer yet, just your reasoning process.\n\nTASK: ${task}${contextBlock}\n\nTHOUGHT:`;
    }
    buildDraftPrompt(task, thought, isConversational, context) {
        const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
        if (task_router_js_1.TaskRouter.isConversationalTask(task) || isConversational) {
            return `You are a helpful assistant. Answer the following question directly and thoroughly.\n` +
                `Do NOT produce code, file changes, or technical analysis unless specifically asked.\n` +
                `Provide a clear, concise, factual answer based on what you know or can observe.\n` +
                `If the question asks about a project or codebase, look at the files and describe what you find.\n` +
                `If the message contains typos or is casually written, infer the user's intent and answer accordingly.\n` +
                `Never say "I didn't understand" — give your best answer based on what you can infer.\n\n` +
                `TASK: ${task}${contextBlock}\n\nANSWER:`;
        }
        const thoughtPrefix = thought ? `STRATEGIC PLAN:\n${thought}\n\n` : '';
        return `You are the writer. Provide a complete answer to the following task. ${thought ? 'Follow the strategic plan provided.' : 'Be specific and concrete.'}\n\n${thoughtPrefix}TASK: ${task}${contextBlock}\n\nANSWER:`;
    }
    buildReviewPrompt(task, draft, isConversational, context) {
        const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
        if (task_router_js_1.TaskRouter.isConversationalTask(task) || isConversational) {
            return `[!] CONVERSATIONAL REVIEW [!]\n` +
                `This is a conversational/general question, NOT a code task.\n` +
                `Do NOT apply code-review criteria.\n` +
                `Evaluate ONLY: factual accuracy, completeness, and clarity.\n` +
                `Default to PASS unless the answer is factually incorrect.\n\n` +
                `IMPORTANT: If the draft is accurate and complete, return it as-is or with minor improvements.\n` +
                `Do NOT produce a JSON verdict with findings. Instead, provide an improved version of the answer.\n\n` +
                `TASK: ${task}${contextBlock}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
        }
        return `You are the reviewer. Read the following draft answer to the task and identify any issues, hallucinations, or missing parts. Provide an improved version of the answer.\n\n` +
            `IMPORTANT: Do NOT produce a JSON verdict with findings. Instead, provide an improved version of the answer.\n` +
            `If the draft is correct, return it with minor improvements. Only flag issues if the answer is factually wrong or incomplete.\n\n` +
            `TASK: ${task}${contextBlock}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
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
        this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount, output });
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
    /**
     * Pick the response most useful to the user. The reviewer may produce
     * meta-analysis ("Reviewer verdict: PASS") rather than an actual
     * answer. In that case, fall back to the writer's draft.
     */
    chooseBestResponse(draft, review) {
        if (!review || review.trim().length === 0)
            return draft;
        if (!draft || draft.trim().length === 0)
            return review;
        const reviewLower = review.trim().toLowerCase();
        // Check if the reviewer produced meta-analysis instead of an actual answer
        const isMetaAnalysis = reviewLower.startsWith('reviewer verdict') ||
            reviewLower.startsWith('verdict:') ||
            reviewLower.startsWith('findings:') ||
            reviewLower.startsWith('review findings:') ||
            reviewLower.startsWith('- [high]') ||
            reviewLower.startsWith('- [med]') ||
            reviewLower.startsWith('- [low]') ||
            reviewLower.startsWith('review:') ||
            reviewLower.startsWith('issues found') ||
            reviewLower.startsWith('the answer') ||
            reviewLower.startsWith('the draft') ||
            reviewLower.startsWith('overall assessment') ||
            reviewLower.startsWith('quality assessment') ||
            // Pattern: starts with a bullet point about severity
            /^[-*]\s*\[?(high|med|low|critical)\]?/i.test(reviewLower) ||
            // Pattern: contains structured findings format
            /severity:\s*(high|med|low)/i.test(review) ||
            // Pattern: starts with a verdict-like statement
            /^(pass|fail|needs?\s*revision)/i.test(reviewLower);
        if (isMetaAnalysis && draft.trim().length > 20)
            return draft;
        if (isMetaAnalysis && draft.trim().length <= 20) {
            return draft.trim().length > 0 ? draft : '';
        }
        return review;
    }
    /**
     * Build a plain-text summary from tool results when the model's closing
     * turn fails or returns nothing. Keeps a tool-driven run useful even on
     * small/finicky models that can't produce a coherent closing message.
     */
    summarizeToolResults(toolResults) {
        const lines = [];
        for (const tr of toolResults) {
            const inner = tr.result.result;
            const ok = inner.success;
            const detail = ok
                ? JSON.stringify(inner.data ?? {})
                : (inner.error ?? 'failed');
            lines.push(`- ${tr.toolName}: ${ok ? 'ok' : 'failed'} — ${detail}`);
        }
        return `Completed ${toolResults.length} tool call(s):\n${lines.join('\n')}`;
    }
    degraded(reason, totalTokens, totalCostUsd, startTime, output = '') {
        this.safeEmit({ type: 'final_response', status: 'needs_user', cost: totalCostUsd, agentCount: 1, output });
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