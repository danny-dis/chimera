"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrioExecutor = void 0;
const response_synthesizer_js_1 = require("../response-synthesizer.js");
const prompts_js_1 = require("../prompts.js");
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
    constructor(deps) {
        this.eventStream = deps.eventStream;
        this.registry = deps.registry;
        this.costTracker = deps.costTracker;
        this.worktreeIsolation = deps.worktreeIsolation;
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
            const draftProvider = providerFactory(config.writer);
            const draftResult = await draftProvider.complete([{ role: 'user', content: this.buildDraftPrompt(task) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
            const inputTokens = draftResult.usage?.inputTokens ?? 0;
            const outputTokens = draftResult.usage?.outputTokens ?? 0;
            draftStage = {
                modelId: config.writer,
                role: 'writer',
                content: draftResult.content,
                inputTokens,
                outputTokens,
                durationMs: Date.now() - draftStart,
            };
            totalTokens += inputTokens + outputTokens;
            const cost = this.computeCost(config.writer, inputTokens, outputTokens);
            totalCostUsd += cost;
            this.recordSpend(config.writer, cost);
        }
        catch (err) {
            return this.degraded(`draft stage failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, false, stages, worktreePath);
        }
        stages.push(draftStage);
        this.safeEmit({ type: 'draft_proposed', agentId: config.writer, patchId: 'pending', confidence: 0 });
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
            const reviewPrompt = this.buildReviewPrompt(task, draftStage.content + linterFeedback);
            // Challenger sees only the draft (not the review) in parallel mode
            const challengePrompt = this.buildChallengePrompt(task, draftStage.content, '');
            const runReview = async () => {
                const start = Date.now();
                const provider = providerFactory(config.reviewer);
                const result = await provider.complete([{ role: 'user', content: reviewPrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
                const inputTokens = result.usage?.inputTokens ?? 0;
                const outputTokens = result.usage?.outputTokens ?? 0;
                return {
                    modelId: config.reviewer,
                    role: 'reviewer',
                    content: result.content,
                    inputTokens,
                    outputTokens,
                    durationMs: Date.now() - start,
                    issues: this.tryExtractIssues(result.content),
                };
            };
            const runChallenge = async () => {
                const start = Date.now();
                const provider = providerFactory(config.challenger);
                const result = await provider.complete([{ role: 'user', content: challengePrompt }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
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
                this.safeEmit({ type: 'challenged', agentId: config.challenger, challenges: challengeStage.challenges ?? [], alternatives: [] });
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
                const reviewResult = await reviewProvider.complete([{ role: 'user', content: this.buildReviewPrompt(task, draftStage.content + linterFeedback) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
                const inputTokens = reviewResult.usage?.inputTokens ?? 0;
                const outputTokens = reviewResult.usage?.outputTokens ?? 0;
                const issues = this.tryExtractIssues(reviewResult.content);
                reviewStage = {
                    modelId: config.reviewer,
                    role: 'reviewer',
                    content: reviewResult.content,
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
                    const challengeResult = await challengeProvider.complete([{ role: 'user', content: this.buildChallengePrompt(task, draftStage.content, reviewStage.content) }], { temperature: config.temperature, maxTokens: config.maxCompletionTokens });
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
                this.safeEmit({ type: 'challenged', agentId: config.challenger, challenges: challengeStage.challenges ?? [], alternatives: [] });
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
                const det = this.runDeterministicSynthesis(task, draftStage, reviewStage, challengeStage);
                analysis = det.analysis;
                finalResponse = det.output;
                needsUserEscalation = det.needsUserEscalation;
                escalationReason = det.escalationReason;
            }
        }
        else {
            // Deterministic synthesis (no LLM call)
            const det = this.runDeterministicSynthesis(task, draftStage, reviewStage, challengeStage);
            analysis = det.analysis;
            finalResponse = det.output;
            needsUserEscalation = det.needsUserEscalation;
            escalationReason = det.escalationReason;
        }
        if (this.isOverBudget(config, totalCostUsd)) {
            return this.degraded(`synthesis cost pushed total $${totalCostUsd.toFixed(4)} past budget`, totalTokens, totalCostUsd, startTime, needsUserEscalation, stages, worktreePath, finalResponse, analysis);
        }
        this.safeEmit({ type: 'quality_gate_parallel_completed', reviewerId: config.reviewer, challengerId: config.challenger ?? '', reviewerStatus: 'fulfilled', challengerStatus: challengeStage ? 'fulfilled' : 'fulfilled', durationMs: Date.now() - startTime });
        this.safeEmit({
            type: 'final_response',
            status: needsUserEscalation ? 'needs_user' : 'done',
            cost: totalCostUsd,
            agentCount: stages.length,
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
                const result = await provider.complete([{ role: 'user', content: prompt }], { responseFormat: 'json_object', temperature: config.temperature, maxTokens: config.maxCompletionTokens });
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
    deriveConsensus(inputs, conflicts) {
        const conflictedAgentIds = new Set(conflicts.flatMap((c) => c.involvedAgents));
        const conflictFreeContents = inputs.filter((i) => !conflictedAgentIds.has(i.agentId));
        return conflictFreeContents.map((i) => i.content.split('\n')[0].slice(0, 200));
    }
    buildDraftPrompt(task) {
        return `You are a code writer. Complete the following task:\n\n${task}`;
    }
    buildReviewPrompt(task, draft) {
        return `You are a code reviewer. Review the following draft against the task.\n\n## Task\n${task}\n\n## Draft\n${draft}`;
    }
    buildChallengePrompt(task, draft, review) {
        return `You are a challenger. Challenge the following draft and review.\n\n## Task\n${task}\n\n## Draft\n${draft}\n\n## Review\n${review}`;
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