"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultAggregator = void 0;
const MERGE_PROMPT = `[!] #RESULT SYNTHESIS DIRECTIVE# [!]
>>> GOAL: UNIFIED & COHERENT COMMAND OUTPUT <<<

IDENTITY: You are Chimera's Result Synthesis Engine. Your purpose is to distill multiple sub-agent outputs into a single, authoritative truth.

# MANDATES #
1. CONFLICT RESOLUTION: Identify and EXPOSE contradictions between sub-agent outputs.
2. DEDUPLICATION: Identify overlaps and merge them into a single coherent section.
3. GAP ANALYSIS: Identify missing requirements that were not covered by any sub-agent.
4. ATOMIC OUTPUT: Produce a unified, complete response.

ACTION: Respond with valid JSON matching this schema:
{
  "mergedOutput": "the unified result",
  "conflicts": [
    {
      "subTaskIds": ["task-1", "task-2"],
      "type": "contradiction" | "overlap" | "gap",
      "description": "precise description of the issue",
      "resolution": "how you resolved it (or why it remains)"
    }
  ],
  "resolved": boolean
}

[!] AS YOU WISH [!]`;
class ResultAggregator {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async aggregate(results) {
        const successful = results.filter((r) => r.status === 'success');
        const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);
        // If only one result, no merging needed
        if (successful.length <= 1) {
            return {
                output: successful[0]?.output ?? '',
                conflicts: [],
                resolved: true,
                subTaskResults: results,
                totalTokens,
            };
        }
        // Build merge prompt with all outputs
        const outputsBlock = successful
            .map((r) => `--- Sub-task ${r.subTaskId} ---\n${r.output}`)
            .join('\n\n');
        try {
            const mergeResult = await this.provider.complete([
                { role: 'system', content: MERGE_PROMPT },
                { role: 'user', content: outputsBlock },
            ], { responseFormat: 'json_object', temperature: 0.2 });
            const parsed = JSON.parse(mergeResult.content);
            return {
                output: parsed.mergedOutput ?? outputsBlock,
                conflicts: (parsed.conflicts ?? []).map((c) => ({
                    subTaskIds: c.subTaskIds ?? [],
                    type: c.type ?? 'gap',
                    description: c.description ?? '',
                    resolution: c.resolution,
                })),
                resolved: parsed.resolved ?? true,
                subTaskResults: results,
                totalTokens,
            };
        }
        catch {
            // Fallback: concatenate outputs
            return {
                output: successful.map((r) => r.output).join('\n\n---\n\n'),
                conflicts: [],
                resolved: false,
                subTaskResults: results,
                totalTokens,
            };
        }
    }
}
exports.ResultAggregator = ResultAggregator;
//# sourceMappingURL=result-aggregator.js.map