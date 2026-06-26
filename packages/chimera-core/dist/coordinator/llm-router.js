"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmRouter = void 0;
const CLASSIFIER_PROMPT = `You are a task classifier for Chimera's multi-agent system.

Given a sub-task description, classify it into one of these types and pick the best model from the pool.

Available models:
{{MODELS}}

Rules:
- Match the sub-task to the model whose specialties best fit
- Prefer cheaper models when quality is comparable
- Consider the full context, not just keywords

Respond with JSON only:
{"subTaskType":"<type>","selectedModel":"<modelId>","reason":"<brief>"}`;
class LlmRouter {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async classify(description, pool) {
        const modelsList = pool.models
            .map((m) => `- ${m.modelId} (tier: ${m.tier}, specialties: ${m.specialties.join(', ')})`)
            .join('\n');
        const prompt = CLASSIFIER_PROMPT.replace('{{MODELS}}', modelsList);
        try {
            const result = await this.provider.complete([
                { role: 'system', content: prompt },
                { role: 'user', content: `Classify this sub-task:\n${description}` },
            ], { responseFormat: 'json_object', temperature: 0 });
            const parsed = JSON.parse(result.content);
            return {
                subTaskType: parsed.subTaskType,
                selectedModel: parsed.selectedModel,
                reason: parsed.reason,
            };
        }
        catch {
            return {
                subTaskType: 'general',
                selectedModel: pool.models[0]?.modelId ?? '',
                reason: 'classification failed, using fallback',
            };
        }
    }
    async classifyBatch(descriptions, pool) {
        const results = await Promise.all(descriptions.map(async (d) => {
            const decision = await this.classify(d.description, pool);
            return [d.id, decision];
        }));
        return new Map(results);
    }
}
exports.LlmRouter = LlmRouter;
//# sourceMappingURL=llm-router.js.map