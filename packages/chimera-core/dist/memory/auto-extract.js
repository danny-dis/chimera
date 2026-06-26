"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoExtractService = exports.ExtractionConfigSchema = void 0;
const zod_1 = require("zod");
const side_query_js_1 = require("../side-query.js");
exports.ExtractionConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    model: zod_1.z.string().optional(),
    minImportance: zod_1.z.number().min(0).max(1).default(0.3),
    maxTokens: zod_1.z.number().positive().default(512),
    timeoutMs: zod_1.z.number().positive().default(15_000),
});
const ExtractedFactSchema = zod_1.z.object({
    facts: zod_1.z.array(zod_1.z.object({
        content: zod_1.z.string().min(1),
        type: zod_1.z.enum(['user', 'feedback', 'project', 'reference']),
        importance: zod_1.z.number().min(0).max(1),
        tags: zod_1.z.array(zod_1.z.string()),
    })),
});
function buildExtractionPrompt(messages) {
    return [
        'Extract durable facts from this conversation turn. Classify each as:',
        '- user: user preferences, habits, or personal context',
        '- feedback: explicit praise, criticism, or correction about the agent or its output',
        '- project: project structure, conventions, naming patterns, or technical decisions',
        '- reference: external resources, documentation links, or tool commands mentioned',
        '',
        'Only extract facts that would be useful in FUTURE sessions. Skip ephemeral details.',
        'Return importance 0-1 (0.9+ for strong preferences, 0.5 for typical facts, 0.3 for weak signals).',
        '',
        '<conversation>',
        messages,
        '</conversation>',
    ].join('\n');
}
/**
 * Turn-level extraction of durable facts from conversation messages.
 * Uses sideQuery (cheap LLM) to classify and score facts, then writes
 * qualifying facts to LongTermMemory.
 */
class AutoExtractService {
    memory;
    config;
    constructor(memory, config) {
        this.memory = memory;
        this.config = exports.ExtractionConfigSchema.parse(config ?? {});
    }
    /**
     * Extract facts from messages starting at `cursor`.
     * Returns the new cursor position (index of next unprocessed message).
     */
    async extract(input) {
        if (!this.config.enabled || input.cursor >= input.messages.length) {
            return input.cursor;
        }
        const newMessages = input.messages.slice(input.cursor);
        if (newMessages.length === 0)
            return input.cursor;
        const formatted = newMessages
            .map((m) => `[${m.role}]: ${m.content.slice(0, 2000)}`)
            .join('\n');
        const result = await (0, side_query_js_1.sideQuery)({
            prompt: buildExtractionPrompt(formatted),
            schema: ExtractedFactSchema,
            model: this.config.model,
            maxTokens: this.config.maxTokens,
            timeoutMs: this.config.timeoutMs,
        });
        if (!result.ok)
            return input.messages.length;
        for (const fact of result.data.facts) {
            if (fact.importance >= this.config.minImportance) {
                await this.memory.write({
                    content: fact.content,
                    topic: fact.type,
                    importance: fact.importance,
                    source: 'agent',
                    sessionId: input.sessionId,
                    tags: fact.tags ?? [],
                });
            }
        }
        return input.messages.length;
    }
}
exports.AutoExtractService = AutoExtractService;
//# sourceMappingURL=auto-extract.js.map