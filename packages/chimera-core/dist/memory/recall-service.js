"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecallService = exports.RecallConfigSchema = void 0;
const zod_1 = require("zod");
exports.RecallConfigSchema = zod_1.z.object({
    maxMemories: zod_1.z.number().positive().default(5),
    maxTokens: zod_1.z.number().positive().default(2000),
    minScore: zod_1.z.number().min(0).max(1).default(0.15),
    boostAccessedRecently: zod_1.z.number().min(0).max(2).default(1.2),
    boostHighImportance: zod_1.z.number().min(0).max(2).default(1.3),
});
const RECENT_THRESHOLD_MS = 60 * 60 * 1000;
const CHARS_PER_TOKEN = 4;
/**
 * Token-budget-aware memory retrieval with recency and importance boosting.
 * Over-fetches from LongTermMemory, re-scores with boost factors, and
 * truncates output to fit within a token budget.
 */
class RecallService {
    memory;
    config;
    constructor(memory, config) {
        this.memory = memory;
        this.config = exports.RecallConfigSchema.parse(config ?? {});
    }
    /**
     * Retrieve and rank memories for a given query.
     * Returns a formatted string suitable for system prompt injection.
     */
    async recall(params) {
        const overfetch = this.config.maxMemories * 3;
        const results = await this.memory.retrieve({ text: params.query, topK: overfetch });
        const now = Date.now();
        const scored = results
            .map((r) => this.boostScore(r, now))
            .filter((r) => r.score >= this.config.minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.config.maxMemories);
        if (scored.length === 0)
            return '';
        const lines = [];
        let tokenEstimate = 0;
        for (const r of scored) {
            const line = `- [${r.item.metadata.topic}] ${r.item.content} (score: ${r.score.toFixed(2)})`;
            const lineTokens = Math.ceil(line.length / CHARS_PER_TOKEN);
            if (tokenEstimate + lineTokens > this.config.maxTokens)
                break;
            lines.push(line);
            tokenEstimate += lineTokens;
        }
        return lines.join('\n');
    }
    boostScore(result, now) {
        let boosted = result.score;
        const age = now - result.item.metadata.lastAccessedAt;
        if (age < RECENT_THRESHOLD_MS) {
            boosted *= this.config.boostAccessedRecently;
        }
        if (result.item.metadata.importance > 0.7) {
            boosted *= this.config.boostHighImportance;
        }
        return { ...result, score: boosted };
    }
}
exports.RecallService = RecallService;
//# sourceMappingURL=recall-service.js.map