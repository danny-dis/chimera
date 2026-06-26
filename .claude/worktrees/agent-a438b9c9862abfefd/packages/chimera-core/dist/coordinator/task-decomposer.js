"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskDecomposer = void 0;
const prompts_js_1 = require("../prompts.js");
class TaskDecomposer {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async decompose(task, context) {
        const messages = (0, prompts_js_1.buildMessages)({ role: 'planner', mode: 'plan', task });
        const outputInstructions = [
            '[!] #STRATEGIC DECOMPOSITION DIRECTIVE# [!]',
            '>>> GOAL: ATOMIC & PARALLELIZABLE TASK TOPOLOGY <<<',
            '',
            'ACTION: Respond with valid JSON matching this schema:',
            '{',
            '  "thought": string,',
            '  "strategy": "parallel" | "sequential" | "mixed",',
            '  "rationale": string,',
            '  "subTasks": [',
            '    {',
            '      "id": string,',
            '      "description": string,',
            '      "dependencies": string[],',
            '      "estimatedTokens": number | "low" | "medium" | "high"',
            '    }',
            '  ]',
            '}',
            '',
            '# MANDATES #',
            '1. TOPOLOGICAL REASONING: Your "thought" field MUST contain deep critical path analysis.',
            '2. INDEPENDENCE: Maximize sub-task independence to enable parallel execution.',
            '3. ATOMICITY: Each sub-task MUST be a self-contained unit of work.',
            '',
            '[!] AS YOU WISH [!]',
        ].join('\n');
        messages.splice(1, 0, { role: 'system', content: outputInstructions });
        if (context) {
            messages.push({ role: 'user', content: `CONTEXT:\n${context}` });
        }
        const result = await this.provider.complete(messages, {
            responseFormat: 'json_object',
            temperature: 0.2,
        });
        try {
            const parsed = JSON.parse(result.content);
            return {
                subTasks: (parsed.subTasks ?? []).map((st) => ({
                    id: st.id,
                    description: st.description,
                    dependencies: st.dependencies ?? [],
                    context: st.context ?? '',
                    provider: this.provider,
                    estimatedTokens: this.estimateTokens(st.estimatedTokens),
                })),
                strategy: parsed.strategy ?? 'parallel',
                rationale: parsed.rationale ?? '',
            };
        }
        catch {
            // If parsing fails, treat the entire task as a single sub-task
            return {
                subTasks: [
                    {
                        id: 'task-1',
                        description: task,
                        dependencies: [],
                        context: context ?? '',
                        provider: this.provider,
                        estimatedTokens: 2000,
                    },
                ],
                strategy: 'sequential',
                rationale: 'Failed to decompose — treating as single task',
            };
        }
    }
    estimateTokens(value) {
        if (typeof value === 'number')
            return value;
        const map = { low: 500, medium: 2000, high: 5000 };
        return map[value] ?? 2000;
    }
}
exports.TaskDecomposer = TaskDecomposer;
//# sourceMappingURL=task-decomposer.js.map