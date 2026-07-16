"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrioExecutor = void 0;
const response_synthesizer_js_1 = require("../response-synthesizer.js");
const prompts_js_1 = require("../prompts.js");
const zod_json_js_1 = require("../zod-json.js");
const output_sanitizer_js_1 = require("./output-sanitizer.js");
const task_router_js_1 = require("../task-router.js");
const tool_execution_helper_js_1 = require("./tool-execution-helper.js");
const file_write_fallback_js_1 = require("./file-write-fallback.js");
const path_from_task_js_1 = require("./path-from-task.js");
/** Best-effort extraction of a single target filename from a task string. */
function expectedPathFromTask(task) {
    const m = task.match(/\b([A-Za-z0-9_\-./]+\.(?:rs|ts|js|jsx|tsx|py|toml|json|md|ya?ml|go|java|cpp|c|rb|php|txt|html|css|sh))\b/);
    return m ? m[1] : undefined;
}
/**
 * Multi-stage quality gate: writer → reviewer → [challenger] → synthesize.
 *
 * Distinct from `FusionExecutor`:
 *   - Stages are **serial**, not parallel — each stage depends on the
 *     previous one's output. The reviewer sees the draft; the challenger
 *     sees the draft + review.
 *   - The synthesizer is **optional**. By default, the deterministic
 *     `ResponseSynthesizer` is used (Jaccard + role authority). This
 *     keeps trio cheap — no extra LLM call beyond the stage calls.
 *   - The draft can be wrapped in a `WorktreeIsolation` worktree.
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth, failover)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `TrioContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output (consensus / conflicts / insights / blind spots / final)
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke + benchmark tests live in `__tests__/`
 */
class TrioExecutor {
    eventStream;
    registry;
    costTracker;
    worktreeIsolation;
    workspaceRoot;
    toolExecutor;
    toolRegistry;
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
        this.worktreeIsolation = deps.worktreeIsolation;
        this.workspaceRoot = deps.workspaceRoot;
        this.toolExecutor = deps.toolExecutor;
        this.toolRegistry = deps.toolRegistry;
    }
    /**
     * Run a trio deliberation and return the final synthesized response
     * as a string. For structured access to the analysis, use
     * {@link executeWithAnalysis}.
     */
    async execute(task, config, providerFactory, context = { depth: 0 }) {
        const result = await this.executeWithAnalysis(task, config, providerFactory, context);
        return result.output;
    }
    /**
     * Run a trio deliberation and return the full structured result.
     */
    async executeWithAnalysis(task, config, providerFactory, context = { depth: 0 }) {
        const startTime = Date.now();
        // Snapshot the target file's on-disk state BEFORE any tool runs, so the
        // completion gate can detect a real edit (mtime/size change) — not merely
        // the pre-existing file still being present (which would be a false done).
        const targetBefore = this.workspaceRoot ? (0, path_from_task_js_1.snapshotTarget)(task, this.workspaceRoot) : null;
        const stages = [];
        let totalTokens = 0;
        let totalCostUsd = 0;
        let worktreePath;
        this.safeEmit({ type: 'quality_gate_parallel_started', reviewerId: config.reviewer, challengerId: config.challenger ?? '', draftPreview: '' });
        // ── Recursion guard ───────────────────────────────────────────────
        const maxDepth = config.maxDepth ?? 1;
        if (context.depth >= maxDepth) {
            return this.degraded('recursion limit reached at depth ' + context.depth, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
        }
        // ── Config validation ─────────────────────────────────────────────
        if (!config.writer || !config.reviewer) {
            return this.degraded('writer and reviewer are required', totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
        }
        // ── Worktree isolation (opt-in) ───────────────────────────────────
        if (config.isolateWorktree) {
            if (!this.worktreeIsolation) {
                return this.degraded('isolateWorktree=true but no WorktreeIsolation provided', totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
            try {
                const wt = await this.worktreeIsolation.createIsolatedWorktree('trio-' + Date.now());
                worktreePath = wt.worktreePath;
            }
            catch (err) {
                return this.degraded(`worktree creation failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
        }
        // ── Stage 1: Draft ─────────────────────────────────────────────────
        const draftStart = Date.now();
        let draftStage;
        try {
            let inputTokensForDraft = 0;
            let outputTokensForDraft = 0;
            const draftProvider = providerFactory(config.writer);
            // A malformed tool registration (empty/undefined name) must never
            // reach the provider: its adapter derefs `tool.name` and would throw
            // `Cannot read properties of undefined (reading 'name')`. Filter any
            // such definition out at the source so a bad tool can't crash the
            // whole draft stage (see debug/trio matrix failure).
            const toolDefs = this.toolRegistry
                ? this.toolRegistry.getAll()
                    .filter((t) => Boolean(t?.name))
                    .map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: (t.parameters ? (0, zod_json_js_1.zodToJsonSchema)(t.parameters) : {}),
                }))
                : undefined;
            const draftResult = await draftProvider.complete([{ role: 'user', content: this.buildDraftPrompt(task, config.context) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}), ...(toolDefs ? { tools: toolDefs } : {}) });
            const inputTokens = draftResult.usage?.inputTokens ?? 0;
            const outputTokens = draftResult.usage?.outputTokens ?? 0;
            let draftContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(draftResult.content);
            let draftWroteFiles = 0;
            // ── Writer tool execution round-trip ─────────────────────────────
            // Writer is the only stage that edits files. If it emitted tool calls
            // and a tool executor is available, execute them via the shared
            // runAgentToolLoop (single source of truth for the LLM→tool→feedback
            // loop), then feed the final content back as the draft.
            const draftToolCalls = draftResult.toolCalls;
            if (draftToolCalls && draftToolCalls.length > 0 && this.toolExecutor && this.workspaceRoot) {
                const loop = await (0, tool_execution_helper_js_1.runAgentToolLoop)({
                    provider: draftProvider,
                    messages: [{ role: 'user', content: this.buildDraftPrompt(task, config.context) }],
                    options: { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) },
                    toolExecutor: this.toolExecutor,
                    toolRegistry: this.toolRegistry,
                    eventStream: this.eventStream,
                    workspaceRoot: this.workspaceRoot,
                    sessionId: `trio-${config.writer}`,
                    initialContent: draftResult.content,
                    initialToolCalls: draftToolCalls,
                    maxRounds: Math.max(1, config.maxDepth ?? 4),
                    mode: 'trio',
                    forceMinFiles: 1,
                    wantsFiles: (0, path_from_task_js_1.taskWantsFiles)(task),
                    task,
                    systemPrompt: prompts_js_1.CHIMERA_CORE_IDENTITY,
                    toolDefs: toolDefs,
                    sanitize: output_sanitizer_js_1.sanitizeWriterOutput,
                });
                if (loop.round > 0) {
                    draftContent = (0, output_sanitizer_js_1.sanitizeWriterOutput)(loop.content);
                    draftWroteFiles = loop.wroteFileCount;
                    // Fold the loop's follow-up token usage into the draft stage counts.
                    inputTokensForDraft = inputTokens + loop.inputTokens;
                    outputTokensForDraft = outputTokens + loop.outputTokens;
                }
                else {
                    inputTokensForDraft = inputTokens;
                    outputTokensForDraft = outputTokens;
                }
            }
            else {
                inputTokensForDraft = inputTokens;
                outputTokensForDraft = outputTokens;
            }
            draftStage = {
                modelId: config.writer,
                role: 'writer',
                content: draftContent,
                inputTokens: inputTokensForDraft,
                outputTokens: outputTokensForDraft,
                durationMs: Date.now() - draftStart,
            };
            totalTokens += inputTokensForDraft + outputTokensForDraft;
            const cost = this.computeCost(config.writer, inputTokensForDraft, outputTokensForDraft);
            totalCostUsd += cost;
            this.recordSpend(config.writer, cost);
            // Fallback: small/free writers often NARRATE file ops instead of emitting
            // native tool calls. Parse that prose and execute it for real. Gate on
            // "no real file landed on disk" (not wroteFileCount — a failed emit would
            // wrongly suppress this), so we don't clobber a file that genuinely landed
            // but always rescue a missing one.
            if (this.toolExecutor && this.workspaceRoot && !(0, path_from_task_js_1.targetChanged)(task, this.workspaceRoot, targetBefore)) {
                try {
                    await (0, file_write_fallback_js_1.executeProseActions)(draftContent, {
                        eventStream: this.eventStream,
                        toolExecutor: this.toolExecutor,
                        toolRegistry: this.toolRegistry,
                        workspaceRoot: this.workspaceRoot,
                        sessionId: `trio-${config.writer}`,
                        expectedPath: expectedPathFromTask(task),
                    });
                }
                catch {
                    /* best-effort */
                }
            }
        }
        catch (err) {
            return this.degraded(`draft stage failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
        }
        stages.push(draftStage);
        // Optional Stage: Linter
        let linterFeedback = '';
        if (config.useLinter) {
            const lintResult = this.runLinter(draftStage.content);
            if (!lintResult.success) {
                linterFeedback = `\n\nLINTER FINDINGS:\n${lintResult.errors.join('\n')}`;
            }
        }
        // Budget check after draft
        if (this.isOverBudget(config, totalCostUsd)) {
            return this.degraded(`draft cost $${totalCostUsd.toFixed(4)} exceeded budget`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
        }
        // ── Stage 2+3: Review + Challenge ─────────────────────────────────
        let reviewStage;
        let challengeStage = null;
        const useParallel = config.parallel !== false && !!config.challenger;
        if (useParallel) {
            // ── Parallel path: reviewer + challenger run concurrently ──────
            const reviewPrompt = this.buildReviewPrompt(task, draftStage.content + linterFeedback, config.context);
            // Challenger sees only the draft (not the review) in parallel mode
            const challengePrompt = this.buildChallengePrompt(task, draftStage.content, '', config.context);
            const runReview = async () => {
                const start = Date.now();
                const provider = providerFactory(config.reviewer);
                const result = await provider.complete([{ role: 'user', content: reviewPrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                const inputTokens = result.usage?.inputTokens ?? 0;
                const outputTokens = result.usage?.outputTokens ?? 0;
                return {
                    modelId: config.reviewer,
                    role: 'reviewer',
                    content: (0, output_sanitizer_js_1.sanitizeReviewerOutput)(result.content),
                    inputTokens,
                    outputTokens,
                    durationMs: Date.now() - start,
                    issues: this.tryExtractIssues(result.content),
                };
            };
            const runChallenge = async () => {
                const start = Date.now();
                const provider = providerFactory(config.challenger);
                const result = await provider.complete([{ role: 'user', content: challengePrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                const inputTokens = result.usage?.inputTokens ?? 0;
                const outputTokens = result.usage?.outputTokens ?? 0;
                return {
                    modelId: config.challenger,
                    role: 'challenger',
                    content: result.content,
                    inputTokens,
                    outputTokens,
                    durationMs: Date.now() - start,
                    challenges: this.tryExtractChallenges(result.content),
                    alternatives: this.tryExtractAlternatives(result.content),
                };
            };
            const [reviewSettled, challengeSettled] = await Promise.allSettled([
                runReview(),
                runChallenge(),
            ]);
            // Extract review result — must succeed
            if (reviewSettled.status === 'fulfilled') {
                reviewStage = reviewSettled.value;
                totalTokens += reviewStage.inputTokens + reviewStage.outputTokens;
                const cost = this.computeCost(config.reviewer, reviewStage.inputTokens, reviewStage.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(config.reviewer, cost);
                stages.push(reviewStage);
                this.safeEmit({ type: 'verified', agentId: config.reviewer, verdict: reviewStage.issues && reviewStage.issues.length > 0 ? 'needs_revision' : 'pass', findings: (reviewStage.issues ?? []).map((i) => ({ description: i.description, severity: i.severity, evidence: i.evidence })) });
            }
            else {
                // Review failed — fall back to sequential for the entire review+challenge block
                return this.degraded(`parallel review failed: ${reviewSettled.reason instanceof Error ? reviewSettled.reason.message : String(reviewSettled.reason)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
            // Extract challenge result — optional, graceful degradation
            if (challengeSettled.status === 'fulfilled') {
                challengeStage = challengeSettled.value;
                totalTokens += challengeStage.inputTokens + challengeStage.outputTokens;
                const cost = this.computeCost(config.challenger, challengeStage.inputTokens, challengeStage.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(config.challenger, cost);
                stages.push(challengeStage);
                this.safeEmit({ type: 'challenged', agentId: config.challenger, challenges: challengeStage.challenges ?? [], alternatives: challengeStage.alternatives ?? [] });
            }
            else {
                // Challenger failed in parallel — emit event but continue with review-only
                this.safeEmit({ type: 'challenged', agentId: config.challenger, challenges: [], alternatives: [] });
            }
            if (this.isOverBudget(config, totalCostUsd)) {
                return this.degraded(`parallel review+challenge cost $${totalCostUsd.toFixed(4)} exceeded budget`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
        }
        else {
            // ── Sequential path (fallback) ─────────────────────────────────
            const reviewStart = Date.now();
            try {
                const reviewProvider = providerFactory(config.reviewer);
                const reviewResult = await reviewProvider.complete([{ role: 'user', content: this.buildReviewPrompt(task, draftStage.content + linterFeedback, config.context) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                const inputTokens = reviewResult.usage?.inputTokens ?? 0;
                const outputTokens = reviewResult.usage?.outputTokens ?? 0;
                const issues = this.tryExtractIssues(reviewResult.content);
                reviewStage = {
                    modelId: config.reviewer,
                    role: 'reviewer',
                    content: (0, output_sanitizer_js_1.sanitizeReviewerOutput)(reviewResult.content),
                    inputTokens,
                    outputTokens,
                    durationMs: Date.now() - reviewStart,
                    issues,
                };
                totalTokens += inputTokens + outputTokens;
                const cost = this.computeCost(config.reviewer, inputTokens, outputTokens);
                totalCostUsd += cost;
                this.recordSpend(config.reviewer, cost);
            }
            catch (err) {
                return this.degraded(`review stage failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
            stages.push(reviewStage);
            this.safeEmit({ type: 'verified', agentId: config.reviewer, verdict: reviewStage.issues && reviewStage.issues.length > 0 ? 'needs_revision' : 'pass', findings: (reviewStage.issues ?? []).map((i) => ({ description: i.description, severity: i.severity, evidence: i.evidence })) });
            if (this.isOverBudget(config, totalCostUsd)) {
                return this.degraded(`review cost pushed total $${totalCostUsd.toFixed(4)} past budget`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
            }
            // Stage 3: Challenge (sequential — sees draft + review)
            if (config.challenger) {
                const challengeStart = Date.now();
                try {
                    const challengeProvider = providerFactory(config.challenger);
                    const challengeResult = await challengeProvider.complete([{ role: 'user', content: this.buildChallengePrompt(task, draftStage.content, reviewStage.content, config.context) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                    const inputTokens = challengeResult.usage?.inputTokens ?? 0;
                    const outputTokens = challengeResult.usage?.outputTokens ?? 0;
                    const challenges = this.tryExtractChallenges(challengeResult.content);
                    challengeStage = {
                        modelId: config.challenger,
                        role: 'challenger',
                        content: challengeResult.content,
                        inputTokens,
                        outputTokens,
                        durationMs: Date.now() - challengeStart,
                        challenges,
                    };
                    totalTokens += inputTokens + outputTokens;
                    const cost = this.computeCost(config.challenger, inputTokens, outputTokens);
                    totalCostUsd += cost;
                    this.recordSpend(config.challenger, cost);
                }
                catch (err) {
                    return this.degraded(`challenge stage failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
                }
                stages.push(challengeStage);
                this.safeEmit({ type: 'challenged', agentId: config.challenger, challenges: challengeStage.challenges ?? [], alternatives: challengeStage.alternatives ?? [] });
                if (this.isOverBudget(config, totalCostUsd)) {
                    return this.degraded(`challenge cost pushed total $${totalCostUsd.toFixed(4)} past budget`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
                }
            }
        }
        // ── Stage 4: Synthesize ───────────────────────────────────────────
        const synthesisStart = Date.now();
        let analysis;
        let finalResponse;
        let needsUserEscalation = false;
        let escalationReason;
        if (config.synthesizer) {
            // LLM synthesizer with failover chain
            const synthChain = [config.synthesizer, ...(config.synthesizerFailover ?? [])];
            const synthResult = await this.runLlmSynthesizer(synthChain, task, stages, providerFactory, config);
            if (synthResult) {
                analysis = synthResult.analysis;
                finalResponse = synthResult.analysis.finalResponse ?? synthResult.content;
                totalTokens += synthResult.inputTokens + synthResult.outputTokens;
                const cost = this.computeCost(synthResult.modelId, synthResult.inputTokens, synthResult.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(synthResult.modelId, cost);
                stages.push({
                    modelId: synthResult.modelId,
                    role: 'synthesizer',
                    content: synthResult.content,
                    inputTokens: synthResult.inputTokens,
                    outputTokens: synthResult.outputTokens,
                    durationMs: Date.now() - synthesisStart,
                });
                // Check if the synthesizer flagged a contradiction
                if (synthResult.analysis.confidence !== undefined && synthResult.analysis.confidence < 0.3) {
                    needsUserEscalation = true;
                    escalationReason = 'synthesizer confidence below threshold';
                }
            }
            else {
                // All synthesizers failed — fall back to deterministic
                const det = this.safeDeterministicSynthesis(task, draftStage, reviewStage, challengeStage);
                analysis = det.analysis;
                finalResponse = det.output;
                needsUserEscalation = det.needsUserEscalation;
                escalationReason = det.escalationReason;
            }
        }
        else {
            // Deterministic synthesis (no LLM call)
            const det = this.safeDeterministicSynthesis(task, draftStage, reviewStage, challengeStage);
            analysis = det.analysis;
            finalResponse = det.output;
            needsUserEscalation = det.needsUserEscalation;
            escalationReason = det.escalationReason;
        }
        if (this.isOverBudget(config, totalCostUsd)) {
            return this.degraded(`synthesis cost pushed total $${totalCostUsd.toFixed(4)} past budget`, totalTokens, totalCostUsd, startTime, needsUserEscalation, stages, worktreePath, finalResponse, analysis);
        }
        this.safeEmit({ type: 'quality_gate_parallel_completed', reviewerId: config.reviewer, challengerId: config.challenger ?? '', reviewerStatus: 'fulfilled', challengerStatus: challengeStage ? 'fulfilled' : 'fulfilled', durationMs: Date.now() - startTime });
        // Completion gate: a task that wants files on disk must have actually
        // written at least one, or we escalate to needs_user instead of a false
        // `done` (small/free models sometimes narrate instead of writing).
        const wantsFiles = (0, path_from_task_js_1.taskWantsFiles)(task);
        if (wantsFiles && this.workspaceRoot) {
            // Completion gate: a file-writing task must have actually MODIFIED its
            // target on disk (mtime/size change vs run start), not merely left a
            // pre-existing file in place. Repo-wide file counts are wrong here: an
            // edit of an existing file would always show "files present" and report
            // a false `done`. `targetChanged` catches real edits (and new files).
            if (!(0, path_from_task_js_1.targetChanged)(task, this.workspaceRoot, targetBefore)) {
                needsUserEscalation = true;
                escalationReason = 'task wanted files but the target was not modified on disk';
            }
        }
        this.safeEmit({
            type: 'final_response',
            status: needsUserEscalation ? 'needs_user' : 'done',
            cost: totalCostUsd,
            agentCount: stages.length,
            output: finalResponse,
        });
        return {
            output: finalResponse,
            analysis,
            stages,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: false,
            worktreePath,
            needsUserEscalation,
            escalationReason,
        };
    }
    // ── private helpers ───────────────────────────────────────────────
    async runLlmSynthesizer(chain, task, stages, providerFactory, config) {
        const prompt = this.buildSynthesizerPrompt(task, stages);
        for (const modelId of chain) {
            let provider;
            try {
                provider = providerFactory(modelId);
            }
            catch {
                continue;
            }
            try {
                const result = await provider.complete([{ role: 'user', content: prompt }], { responseFormat: 'json_object', temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) });
                const content = result.content;
                try {
                    const parsed = JSON.parse(content);
                    return {
                        modelId,
                        content,
                        inputTokens: result.usage?.inputTokens ?? 0,
                        outputTokens: result.usage?.outputTokens ?? 0,
                        analysis: {
                            thought: parsed.thought ?? '',
                            finalResponse: parsed.finalResponse ?? content,
                            consensus: parsed.consensus ?? [],
                            conflicts: parsed.conflicts ?? [],
                            uniqueInsights: parsed.uniqueInsights ?? [],
                            blindSpots: parsed.blindSpots ?? [],
                            confidence: parsed.confidence ?? 0.5,
                        },
                    };
                }
                catch {
                    return {
                        modelId,
                        content,
                        inputTokens: result.usage?.inputTokens ?? 0,
                        outputTokens: result.usage?.outputTokens ?? 0,
                        analysis: { finalResponse: content, thought: '' },
                    };
                }
            }
            catch {
                continue;
            }
        }
        return null;
    }
    runDeterministicSynthesis(_task, draft, review, challenge) {
        const inputs = [
            { agentId: draft.modelId, role: 'writer', content: draft.content, confidence: 0.8 },
            { agentId: review.modelId, role: 'reviewer', content: review.content, confidence: 0.7, issues: review.issues },
        ];
        if (challenge) {
            inputs.push({ agentId: challenge.modelId, role: 'challenger', content: challenge.content, confidence: 0.6, challenges: challenge.challenges });
        }
        const synthesizer = new response_synthesizer_js_1.ResponseSynthesizer();
        const result = synthesizer.synthesize(inputs);
        // Map SynthesisResult → 5-field analysis
        const analysis = {
            thought: '',
            finalResponse: result.unifiedResponse,
            consensus: this.deriveConsensus(inputs, result.conflicts),
            conflicts: result.conflicts.map((c) => `${c.type}: ${c.description}`),
            uniqueInsights: result.mergedIssues.map((i) => i.description),
            blindSpots: [], // Deterministic synthesis can't detect blind spots — known gap
            confidence: result.overallConfidence,
        };
        return {
            output: result.unifiedResponse,
            analysis,
            needsUserEscalation: result.needsUserEscalation,
            escalationReason: result.escalationReason,
        };
    }
    safeDeterministicSynthesis(task, draftStage, reviewStage, challengeStage) {
        // Stage content may be undefined when a model returned no parseable
        // content (e.g. truncated/malformed response). Default defensively so
        // the synthesizer never dereferences `undefined.content` and throws.
        const safe = (s) => s ? { ...s, content: s.content ?? '' } : s;
        const d = safe(draftStage);
        const r = safe(reviewStage);
        const c = challengeStage ? safe(challengeStage) : null;
        try {
            return this.runDeterministicSynthesis(task, d, r, c);
        }
        catch (err) {
            // Synthesis must never crash the orchestrator — degrade gracefully.
            const message = err instanceof Error ? err.message : String(err);
            return {
                output: d.content || r.content || '',
                analysis: {
                    thought: '',
                    finalResponse: d.content || r.content || '',
                    conflicts: [],
                    uniqueInsights: [],
                    blindSpots: [],
                    confidence: 0,
                },
                needsUserEscalation: true,
                escalationReason: `deterministic synthesis failed: ${message}`,
            };
        }
    }
    deriveConsensus(inputs, conflicts) {
        const conflictedAgentIds = new Set(conflicts.flatMap((c) => c.involvedAgents));
        const conflictFreeContents = inputs.filter((i) => !conflictedAgentIds.has(i.agentId));
        return conflictFreeContents.map((i) => i.content.split('\n')[0].slice(0, 200));
    }
    buildDraftPrompt(task, context) {
        if (task_router_js_1.TaskRouter.isConversationalTask(task)) {
            const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
            return `You are a helpful assistant. Answer the following conversational question directly.\n` +
                `Do NOT produce code, file changes, or technical analysis unless specifically asked.\n` +
                `Provide a clear, concise, factual answer.\n\n${task}${contextBlock}`;
        }
        // Route the writer through the rich role prompt (AGENT_PROMPTS.writer +
        // tool-calling guidance) so it actually acts instead of narrating prose.
        // The leading marker keeps prompt-shape contracts (and test mocks that
        // match on it) intact.
        const roleMsg = (0, prompts_js_1.buildMessages)({
            role: 'writer',
            mode: 'code',
            task,
            context,
            workspaceRoot: this.workspaceRoot,
        })
            .map((m) => `### ${m.role.toUpperCase()}\n${m.content}`)
            .join('\n\n');
        return `You are a code writer.\n\n${roleMsg}`;
    }
    buildReviewPrompt(task, draft, context) {
        const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
        if (task_router_js_1.TaskRouter.isConversationalTask(task)) {
            return `[!] CONVERSATIONAL REVIEW [!]\n` +
                `This is a conversational/general question, NOT a code task.\n` +
                `Do NOT apply code-review criteria (race conditions, input validation, architectural coupling, etc.).\n` +
                `Evaluate ONLY: factual accuracy, completeness, and clarity.\n` +
                `Default to PASS unless the answer is factually incorrect.\n\n` +
                `## Task\n${task}\n\n## Draft\n${draft}${contextBlock}`;
        }
        return `You are a code reviewer. Review the following draft against the task.\n\n## Task\n${task}\n\n## Draft\n${draft}${contextBlock}`;
    }
    buildChallengePrompt(task, draft, review, context) {
        const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
        return `You are a challenger. Challenge the following draft and review.\n\n## Task\n${task}\n\n## Draft\n${draft}\n\n## Review\n${review}${contextBlock}`;
    }
    buildDraftMessages(task, mode) {
        const messages = (0, prompts_js_1.buildMessages)({ role: 'writer', mode, task });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "filesChanged": string[], "rationale": string}',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    buildReviewMessages(task, draft, mode) {
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'reviewer',
            mode,
            task: [
                '## Original Task',
                task,
                '',
                '## Draft Output',
                draft,
                '',
                'Evaluate the draft against the task. Return structured JSON.',
            ].join('\n'),
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "verdict": "PASS"|"FAIL"|"NEEDS_REVISION", "confidence": number 0-1, "findings": Array<{description: string, severity: "high"|"med"|"low", evidence: string}>}',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    buildChallengeMessages(task, draft, review) {
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'challenger',
            mode: 'review',
            task: [
                '## Original Task',
                task,
                '',
                '## Writer Draft',
                draft,
                '',
                '## Reviewer Verdict',
                review,
                '',
                'Critique both the draft and the review. Propose alternatives if needed. Return structured JSON.',
            ].join('\n'),
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "challenges": string[], "alternatives": string[], "edgeCases": string[], "confidence": number 0-1}',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    buildSynthesizerPrompt(task, stages) {
        return [
            'You are the synthesizer. Read the outputs from the writer, reviewer, and challenger.',
            'Identify consensus, contradictions, unique insights, and blind spots.',
            'Write a final response that incorporates the strongest points.',
            '',
            'TASK:',
            task,
            '',
            'STAGE OUTPUTS:',
            ...stages.map((s) => `--- ${s.role} (${s.modelId}) ---\n${s.content}`),
            '',
            'Output MUST be valid JSON matching this schema:',
            '{',
            '  "thought": string,',
            '  "finalResponse": string,',
            '  "consensus": string[],',
            '  "conflicts": string[],',
            '  "uniqueInsights": string[],',
            '  "blindSpots": string[],',
            '  "confidence": number',
            '}',
        ].join('\n');
    }
    buildRevisionMessages(task, previousDraft, reviewContent, issues, mode) {
        const issueList = issues
            .map((i) => `- [${i.severity.toUpperCase()}] ${i.description} (evidence: ${i.evidence})`)
            .join('\n');
        const messages = (0, prompts_js_1.buildMessages)({
            role: 'writer',
            mode,
            task: [
                '## Original Task',
                task,
                '',
                '## Your Previous Draft',
                previousDraft,
                '',
                "## Reviewer's Findings (address these)",
                issueList,
                '',
                '## Reviewer Commentary',
                reviewContent,
                '',
                'Revise the draft to address ALL reviewer findings. Preserve what was correct; fix what was wrong. Do not introduce new issues.',
            ].join('\n'),
        });
        const outputInstructions = [
            'Respond with valid JSON matching this schema:',
            '{"thought": string, "response": string, "confidence": number 0-1, "changes": string[], "rationale": string}',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        return messages;
    }
    tryExtractIssues(content) {
        try {
            const parsed = JSON.parse(content);
            // Support both old schema ("issues") and new schema ("findings")
            if (Array.isArray(parsed.findings))
                return parsed.findings;
            if (Array.isArray(parsed.issues))
                return parsed.issues;
        }
        catch {
            // not JSON
        }
        return undefined;
    }
    tryExtractChallenges(content) {
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed.challenges))
                return parsed.challenges;
        }
        catch {
            // not JSON
        }
        return undefined;
    }
    tryExtractAlternatives(content) {
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed.alternatives))
                return parsed.alternatives;
        }
        catch {
            // not JSON
        }
        return undefined;
    }
    needsRevision(reviewStage, severityThreshold = 'high') {
        const issues = reviewStage.issues;
        if (!issues || issues.length === 0)
            return false;
        const order = { high: 3, med: 2, low: 1 };
        const min = order[severityThreshold];
        return issues.some((i) => (order[i.severity] ?? 0) >= min);
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
    degraded(reason, totalTokens, totalCostUsd, startTime, needsUserEscalation, stages, worktreePath, output = '', analysis = {}) {
        return {
            output,
            analysis,
            stages,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: true,
            degradationReason: reason,
            worktreePath,
            needsUserEscalation,
        };
    }
}
exports.TrioExecutor = TrioExecutor;
//# sourceMappingURL=trio-executor.js.map