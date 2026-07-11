import { EventStream } from '../event-stream.js';
import type { LLMProvider } from '../session-orchestrator.js';
import type { ModelRegistry, ModelEntry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import type {
  FusionConfig,
  FusionContext,
  FusionPanelResult,
  FusionResultV2,
  FusionProviderFactory,
  FusionAnalysis,
} from './fusion-types.js';

export type {
  FusionConfig,
  FusionContext,
  FusionPanelResult,
  FusionResultV2,
  FusionProviderFactory,
  FusionAnalysis,
} from './fusion-types.js';

/**
 * Extract a JSON object from model output that may be wrapped in markdown
 * fences (```json ... ```) and/or preceded by prose. Falls back to locating
 * the first balanced `{...}` block. Throws if no valid JSON object is found.
 */
function extractJsonObject(raw: string): Record<string, unknown> {
  if (!raw) throw new Error('empty content');
  const candidates: string[] = [];

  // 1) Whole-string parse.
  candidates.push(raw.trim());

  // 2) Strip a ```json / ``` fenced block.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());

  // 3) Every balanced {...} substring (handles multiple blocks / prose).
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(raw.slice(i, j + 1));
          break;
        }
      }
    }
  }

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('no JSON object found');
}

interface FusionExecutorDeps {
  eventStream: EventStream;
  registry: ModelRegistry;
  costTracker?: CostTracker;
}

/**
 * Multi-model deliberation (Fusion mode).
 * Parallel panel of models generates answers, then a judge synthesizes.
 */
export class FusionExecutor {
  private eventStream: EventStream;
  private registry: ModelRegistry;
  private costTracker: CostTracker | undefined;

  constructor(deps: FusionExecutorDeps) {
    this.eventStream = deps.eventStream;
    this.registry = deps.registry;
    this.costTracker = deps.costTracker;
  }

  async execute(
    task: string,
    config: FusionConfig,
    providerFactory: FusionProviderFactory,
    context: FusionContext = { depth: 0 }
  ): Promise<string> {
    const result = await this.executeWithAnalysis(task, config, providerFactory, context);
    return result.output;
  }

  async executeWithAnalysis(
    task: string,
    config: FusionConfig,
    providerFactory: FusionProviderFactory,
    context: FusionContext = { depth: 0 }
  ): Promise<FusionResultV2> {
    const startTime = Date.now();
    let totalTokens = 0;
    let totalCostUsd = 0;
    const panelResults: FusionPanelResult[] = [];

    // ── Recursion guard ───────────────────────────────────────────────
    const maxDepth = config.maxDepth ?? 1;
    if (context.depth >= maxDepth) {
      this.safeEmit({ type: 'fusion_recursion_blocked', depth: context.depth, maxDepth });
      return this.degraded('recursion limit reached', totalTokens, totalCostUsd, startTime);
    }

    // Resolve Panel Models ──────────────────────────────────────────
    let models = config.analysisModels ?? [];
    // If user provided panelSize (N) but no models, auto-select
    if (models.length === 0 && config.panelSize) {
        const n = config.panelSize;
        const allModelsMap = (this.registry as any).models;
        const allModels: any[] = allModelsMap instanceof Map ? Array.from(allModelsMap.values()) : (Array.isArray(allModelsMap) ? allModelsMap : []);
        
        let available = allModels.filter((m: any) => !m.deprecated);
        
        if (config.preferLocal) {
            const localModels = available.filter((m: any) => m.provider === 'local');
            const otherModels = available.filter((m: any) => m.provider !== 'local');
            // Prioritize local models, then fill with others
            available = [...localModels, ...otherModels];
        } else {
            // Default: pick top cheap/mid models
            available = available.filter((m: any) => m.tier === 'cheap' || m.tier === 'mid');
        }

        models = available.slice(0, n).map((m: any) => m.id);
    }

    if (models.length === 0) {
      return this.degraded('no panel models available', totalTokens, totalCostUsd, startTime);
    }

    this.safeEmit({ type: 'fusion_started', task, models, judge: config.judgeModel });

    // ── Parallel Panel Calls ──────────────────────────────────────────
    const panelSettled = await Promise.allSettled(
      models.map(async (modelId, index) => {
        const start = Date.now();
        const provider = providerFactory(modelId);
        
        let finalTask = task;
        if (config.diversePerspectives) {
            const perspectives = [
                'Focus specifically on security vulnerabilities and robustness.',
                'Focus specifically on performance, efficiency, and resource usage.',
                'Focus specifically on readability, maintainability, and clean code principles.',
                'Focus specifically on edge cases, error handling, and boundary conditions.',
                'Focus specifically on architectural alignment and design patterns.',
            ];
            const perspective = perspectives[index % perspectives.length];
            finalTask = `PERSPECTIVE: ${perspective}\n\nTASK: ${task}`;
        }

        const res = await provider.complete(
          [{ role: 'user', content: finalTask }],
          { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) }
        );
        return {
          modelId,
          content: res.content,
          inputTokens: res.usage?.inputTokens ?? 0,
          outputTokens: res.usage?.outputTokens ?? 0,
          durationMs: Date.now() - start,
        };
      })
    );

    for (const res of panelSettled) {
      if (res.status === 'fulfilled') {
        const v = res.value;
        panelResults.push(v);
        totalTokens += v.inputTokens + v.outputTokens;
        const cost = this.computeCost(v.modelId, v.inputTokens, v.outputTokens);
        totalCostUsd += cost;
        this.recordSpend(v.modelId, cost);
      } else {
        const errStr = String(res.reason);
        this.safeEmit({ type: 'fusion_provider_error', modelId: 'unknown', error: errStr });
        panelResults.push({ modelId: 'unknown', content: '', inputTokens: 0, outputTokens: 0, durationMs: 0, error: errStr });
      }
    }

    if (panelResults.length === 0) {
      return this.degraded('all panel models failed', totalTokens, totalCostUsd, startTime);
    }

    // ── Optional Adversarial Round ────────────────────────────────────
    if (config.adversarialRound) {
        const round1Summary = panelResults.map(r => `--- ${r.modelId} ---\n${r.content}`).join('\n\n');
        
        const adversarialSettled = await Promise.allSettled(
            models.map(async (modelId) => {
                const prevResult = panelResults.find(r => r.modelId === modelId);
                if (!prevResult) return null; // Should not happen

                const start = Date.now();
                const provider = providerFactory(modelId);
                const rebuttalPrompt = [
                    'You are participating in a multi-model debate.',
                    'Your initial answer:',
                    prevResult.content,
                    '',
                    'Here are the answers from other models in the panel:',
                    round1Summary,
                    '',
                    'Review the other perspectives and provide your final refined answer. Address any contradictions or improvements identified.',
                    'TASK:',
                    task,
                    '',
                    'FINAL ANSWER:'
                ].join('\n');

                const res = await provider.complete(
                    [{ role: 'user', content: rebuttalPrompt }],
                    { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) }
                );

                return {
                    modelId,
                    content: res.content,
                    inputTokens: res.usage?.inputTokens ?? 0,
                    outputTokens: res.usage?.outputTokens ?? 0,
                    durationMs: Date.now() - start,
                };
            })
        );

        for (const res of adversarialSettled) {
            if (res.status === 'fulfilled' && res.value) {
                const v = res.value;
                // Update the panelResults with refined content
                const idx = panelResults.findIndex(r => r.modelId === v.modelId);
                if (idx !== -1) {
                    panelResults[idx] = v;
                }
                totalTokens += v.inputTokens + v.outputTokens;
                const cost = this.computeCost(v.modelId, v.inputTokens, v.outputTokens);
                totalCostUsd += cost;
                this.recordSpend(v.modelId, cost);
            }
        }
    }

    // ── Budget enforcement (after panel calls, before judge) ──────────
    if (config.budgetUsd !== undefined) {
      const currentCost = this.costTracker?.getTotalCost() ?? 0;
      if (currentCost >= config.budgetUsd) {
        this.safeEmit({ type: 'fusion_budget_exceeded', currentCost, budget: config.budgetUsd });
        return this.degraded('budget exceeded', totalTokens, totalCostUsd, startTime);
      }
    }

    // ── Judge Step (with failover chain) ──────────────────────────────
    const judgeStart = Date.now();
    let analysis: Partial<FusionAnalysis> | undefined;
    const judgeModels = [config.judgeModel, ...(config.judgeFailover ?? [])];
    const prompt = this.buildJudgePrompt(task, panelResults);

    for (const judgeModel of judgeModels) {
      try {
        const judgeProvider = providerFactory(judgeModel);
        const judgeRes = await judgeProvider.complete(
          [{ role: 'user', content: prompt }],
          { responseFormat: 'json_object', temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) }
        );

        let parsed: Record<string, unknown>;
        try {
          parsed = extractJsonObject(judgeRes.content);
        } catch {
          this.safeEmit({ type: 'fusion_judge_parse_error', raw: judgeRes.content });
          return this.degraded('judge returned non-JSON output', totalTokens, totalCostUsd, startTime);
        }

        analysis = {
          thought: (parsed.thought as string) ?? '',
          finalResponse: (parsed.finalResponse as string) ?? judgeRes.content,
          consensus: (parsed.consensus as string[]) ?? [],
          conflicts: (parsed.conflicts as string[]) ?? [],
          uniqueInsights: (parsed.uniqueInsights as string[]) ?? [],
          blindSpots: (parsed.blindSpots as string[]) ?? [],
          confidence: (parsed.confidence as number) ?? 0.8,
        };

        totalTokens += (judgeRes.usage?.inputTokens ?? 0) + (judgeRes.usage?.outputTokens ?? 0);
        const cost = this.computeCost(judgeModel, judgeRes.usage?.inputTokens ?? 0, judgeRes.usage?.outputTokens ?? 0);
        totalCostUsd += cost;
        this.recordSpend(judgeModel, cost);
        break;
      } catch (err) {
        this.safeEmit({ type: 'fusion_fallback_judge', failedModel: judgeModel, error: String(err) });
      }
    }

    if (!analysis) {
      return this.degraded('all judges failed', totalTokens, totalCostUsd, startTime);
    }

    this.safeEmit({ type: 'fusion_completed', task, durationMs: Date.now() - startTime, totalCostUsd });

    return {
      output: analysis.finalResponse!,
      analysis,
      totalTokens,
      totalCostUsd,
      durationMs: Date.now() - startTime,
      degraded: false,
    };
  }

  private buildJudgePrompt(task: string, results: FusionPanelResult[]): string {
    return [
      'You are the judge in a multi-model fusion process.',
      'Task:',
      task,
      '',
      'Panel Responses:',
      ...results.map((r) => `--- Model: ${r.modelId} ---\n${r.content}\n`),
      '',
      'Provide a structured analysis in JSON:',
      '{',
      '  "thought": "your reasoning",',
      '  "finalResponse": "the best synthesized answer",',
      '  "consensus": ["points of agreement"],',
      '  "conflicts": ["points of disagreement"],',
      '  "uniqueInsights": ["novel ideas from specific models"],',
      '  "blindSpots": ["potential errors or gaps"],',
      '  "confidence": 0.0-1.0',
      '}'
    ].join('\n');
  }

  private computeCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const entry = this.lookupModel(modelId);
    if (!entry) return 0;
    return (inputTokens / 1_000_000) * entry.pricing.inputPerMillion + (outputTokens / 1_000_000) * entry.pricing.outputPerMillion;
  }

  private lookupModel(modelId: string): ModelEntry | null {
    const reg = this.registry as unknown as { get?: (id: string) => ModelEntry | undefined; models?: ModelEntry[] };
    if (typeof reg.get === 'function') return reg.get(modelId) ?? null;
    if (Array.isArray(reg.models)) return reg.models.find((m) => m.id === modelId) ?? null;
    return null;
  }

  private recordSpend(modelId: string, costUsd: number): void {
    if (this.costTracker && costUsd > 0) this.costTracker.recordSpend(modelId, costUsd);
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* ignore */ }
  }

  private degraded(reason: string, totalTokens: number, totalCostUsd: number, startTime: number): FusionResultV2 {
    return {
      output: '',
      analysis: {},
      totalTokens,
      totalCostUsd,
      durationMs: Date.now() - startTime,
      degraded: true,
      degradationReason: reason,
    };
  }
}
