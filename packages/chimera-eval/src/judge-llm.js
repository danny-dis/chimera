"use strict";
/**
 * LLM-based judge for evaluating trajectory quality.
 * Uses the sideQuery channel to get a cheap LLM's assessment.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeTrajectory = judgeTrajectory;
exports.formatJudgeScore = formatJudgeScore;
const side_query_js_1 = require("./side-query.js");
/**
 * Build a prompt asking the judge to evaluate a trajectory.
 */
function buildJudgePrompt(trajectory, task) {
    const stepsSummary = trajectory.steps
        .map((s) => {
        const type = s.type;
        const detail = s.error ? ` (error: ${s.error})` : '';
        return `- [${type}]${detail}`;
    })
        .join('\n');
    return [
        `You are a code quality judge. Evaluate the following agent trajectory.`,
        ``,
        `Task: ${task.description}`,
        task.acceptanceCriteria?.length
            ? `Acceptance criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`
            : ``,
        ``,
        `Trajectory (${trajectory.steps.length} steps):`,
        stepsSummary,
        ``,
        `Output: ${trajectory.finalOutput?.slice(0, 500) ?? '(none)'}`,
        `Total cost: $${trajectory.totalCost.toFixed(4)}`,
        ``,
        `Respond with JSON only:`,
        `{ "score": <0-1>, "confidence": <0-1>, "rationale": "<brief explanation>" }`,
    ]
        .filter(Boolean)
        .join('\n');
}
/**
 * Strip markdown fences from a JSON string.
 */
function stripFences(raw) {
    const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenced)
        return fenced[1].trim();
    return raw.trim();
}
/**
 * Clamp a number to [0, 1].
 */
function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}
/**
 * Ask an LLM judge to score a trajectory.
 * Falls back to 0.5 / low confidence on parse failure.
 */
async function judgeTrajectory(trajectory, task, provider) {
    const modelInfo = provider.getModel();
    const prompt = buildJudgePrompt(trajectory, task);
    const raw = await (0, side_query_js_1.sideQuery)(provider, [{ role: 'user', content: prompt }], {
        temperature: 0,
        maxTokens: 256,
    });
    const cleaned = stripFences(raw);
    try {
        const parsed = JSON.parse(cleaned);
        return {
            score: clamp01(Number(parsed.score) ?? 0.5),
            confidence: clamp01(Number(parsed.confidence) ?? 0.3),
            rationale: String(parsed.rationale ?? ''),
            raw,
            provider: modelInfo.provider,
            model: modelInfo.id,
        };
    }
    catch {
        return {
            score: 0.5,
            confidence: 0.3,
            rationale: `Judge returned unparseable output: ${raw.slice(0, 120)}`,
            raw,
            provider: modelInfo.provider,
            model: modelInfo.id,
        };
    }
}
/**
 * Format a JudgeVerdict into a human-readable one-liner.
 */
function formatJudgeScore(verdict) {
    const pct = Math.round(verdict.score * 100);
    const confPct = Math.round(verdict.confidence * 100);
    return `Judge: ${pct}% quality (${confPct}% confidence) via ${verdict.provider}/${verdict.model} — ${verdict.rationale}`;
}
//# sourceMappingURL=judge-llm.js.map