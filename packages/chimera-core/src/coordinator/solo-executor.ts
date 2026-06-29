import { EventStream } from '../event-stream.js';
import type { ModelRegistry, ModelEntry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import { ResponseSynthesizer, type SynthesisInput } from '../response-synthesizer.js';
import { sanitizeWriterOutput } from './output-sanitizer.js';
import type {
  SoloConfig,
  SoloContext,
  SoloResult,
  SoloProviderFactory,
  SoloAnalysis,
} from './solo-types.js';

export type {
  SoloConfig,
  SoloContext,
  SoloResult,
  SoloProviderFactory,
  SoloAnalysis,
} from './solo-types.js';

interface SoloExecutorDeps {
  eventStream: EventStream;
  /** Model registry — used for cost lookups. */
  registry: ModelRegistry;
  /** Optional cost tracker. */
  costTracker?: CostTracker;
}

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
export class SoloExecutor {
  private eventStream: EventStream;
  private registry: ModelRegistry;
  private costTracker: CostTracker | undefined;

  constructor(deps: SoloExecutorDeps) {
    this.eventStream = deps.eventStream;
    this.registry = deps.registry;
    this.costTracker = deps.costTracker;
  }

  /**
   * Run a solo execution and return the final response as a string.
   * For structured access to the analysis, use {@link executeWithAnalysis}.
   */
  async execute(
    task: string,
    config: SoloConfig,
    providerFactory: SoloProviderFactory,
    context: SoloContext = { depth: 0 }
  ): Promise<string> {
    const result = await this.executeWithAnalysis(task, config, providerFactory, context);
    return result.output;
  }

  /**
   * Run a solo execution and return the full structured result.
   */
  async executeWithAnalysis(
    task: string,
    config: SoloConfig,
    providerFactory: SoloProviderFactory,
    context: SoloContext = { depth: 0 }
  ): Promise<SoloResult> {
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
    let draftContent: string;
    let thought: string = '';

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
      } catch (err) {
        return this.degraded(`thought call failed: ${String(err)}`, totalTokens, totalCostUsd, startTime);
      }
    }

    try {
      const res = await this.callPeer('writer', config.model, task, config, providerFactory, undefined, thought);
      draftContent = sanitizeWriterOutput(res.content);
      totalTokens += res.inputTokens + res.outputTokens;
      const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
      totalCostUsd += cost;
      this.recordSpend(config.model, cost);
    } catch (err) {
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
    let reviewContent: string;
    try {
      const res = await this.callPeer('reviewer', config.model, task, config, providerFactory, draftContent);
      reviewContent = res.content;
      totalTokens += res.inputTokens + res.outputTokens;
      const cost = this.computeCost(config.model, res.inputTokens, res.outputTokens);
      totalCostUsd += cost;
      this.recordSpend(config.model, cost);
    } catch (err) {
      // If verification fails, return the draft as degraded
      return this.degraded(`verification call failed: ${String(err)}`, totalTokens, totalCostUsd, startTime, draftContent);
    }

    // ── Synthesis ─────────────────────────────────────────────────────
    // For Solo mode, we treat the 'reviewer' as the improved version.
    // We return it directly as the output, while keeping the 5-field
    // analysis for consistency.
    const finalResponse = reviewContent;

    const analysis: Partial<SoloAnalysis> = {
      thought,
      finalResponse,
      consensus: [draftContent],
      conflicts: [],
      uniqueInsights: [reviewContent],
      blindSpots: [],
      confidence: 0.9, // Higher confidence after self-correction
    };

    this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount: config.eternalCoT ? 3 : 2 });

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

  private async callPeer(
    role: 'writer' | 'reviewer' | 'thinker',
    modelId: string,
    task: string,
    config: SoloConfig,
    providerFactory: SoloProviderFactory,
    draft?: string,
    thought?: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const start = Date.now();
    const provider = providerFactory(modelId);
    let prompt: string;
    
    switch (role) {
      case 'thinker':
        prompt = this.buildThinkPrompt(task);
        break;
      case 'writer':
        prompt = this.buildDraftPrompt(task, thought);
        break;
      case 'reviewer':
        prompt = this.buildReviewPrompt(task, draft!);
        break;
    }

    const r = await provider.complete(
      [{ role: 'user', content: prompt }],
      { temperature: config.temperature, maxTokens: config.maxCompletionTokens }
    );
    return {
      content: r.content,
      inputTokens: r.usage?.inputTokens ?? 0,
      outputTokens: r.usage?.outputTokens ?? 0,
      durationMs: Date.now() - start,
    };
  }

  private buildThinkPrompt(task: string): string {
    return `You are a strategic thinker. Analyze the following task and plan your approach. Identify potential pitfalls and best practices. Do not provide the final answer yet, just your reasoning process.\n\nTASK: ${task}\n\nTHOUGHT:`;
  }

  private buildDraftPrompt(task: string, thought?: string): string {
    const thoughtPrefix = thought ? `STRATEGIC PLAN:\n${thought}\n\n` : '';
    return `You are the writer. Provide a complete answer to the following task. ${thought ? 'Follow the strategic plan provided.' : 'Be specific and concrete.'}\n\n${thoughtPrefix}TASK: ${task}\n\nANSWER:`;
  }

  private buildReviewPrompt(task: string, draft: string): string {
    return `You are the reviewer. Read the following draft answer to the task and identify any issues, hallucinations, or missing parts. Provide an improved version of the answer.\n\nTASK: ${task}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
  }

  private finalizeSolo(
    output: string,
    totalTokens: number,
    totalCostUsd: number,
    startTime: number,
    agentCount: number,
    thought: string = ''
  ): SoloResult {
    const analysis: Partial<SoloAnalysis> = {
      thought,
      finalResponse: output,
      consensus: [],
      conflicts: [],
      uniqueInsights: [],
      blindSpots: [],
      confidence: 0.8,
    };
    this.safeEmit({ type: 'final_response', status: 'done', cost: totalCostUsd, agentCount });
    return {
      output,
      analysis,
      totalTokens,
      totalCostUsd,
      durationMs: Date.now() - startTime,
      degraded: false,
    };
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

  private isOverBudget(config: SoloConfig, currentCost: number): boolean {
    return config.budgetUsd !== undefined && config.budgetUsd > 0 && currentCost > config.budgetUsd;
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* schema mismatch — ignore */ }
  }

  private degraded(
    reason: string,
    totalTokens: number,
    totalCostUsd: number,
    startTime: number,
    output = ''
  ): SoloResult {
    this.safeEmit({ type: 'final_response', status: 'needs_user', cost: totalCostUsd, agentCount: 1 });
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

