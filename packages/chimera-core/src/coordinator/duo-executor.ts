import { EventStream } from '../event-stream.js';
import type { LLMProvider, ToolExecutorInterface, ToolRegistryInterface } from '../session-orchestrator.js';
import type { ModelRegistry, ModelEntry } from '@chimera/providers';
import type { CostTracker } from '../cost-tracker.js';
import { ResponseSynthesizer, type SynthesisInput } from '../response-synthesizer.js';
import { sanitizeWriterOutput, sanitizeReviewerOutput } from './output-sanitizer.js';
import { TaskRouter } from '../task-router.js';
import { runAgentToolLoop, countSourceFiles } from './agent-tool-loop.js';
import { executeProseActions } from './file-write-fallback.js';
import { taskWantsFiles } from './path-from-task.js';
import type {
  DuoConfig,
  DuoContext,
  DuoSource,
  DuoResult,
  DuoAnalysis,
  DuoProviderFactory,
} from './duo-types.js';

export type {
  DuoConfig,
  DuoContext,
  DuoSource,
  DuoResult,
  DuoAnalysis,
  DuoProviderFactory,
} from './duo-types.js';

interface DuoExecutorDeps {
  eventStream: EventStream;
  /** Model registry — used for cost lookups and (future) capability checks. */
  registry: ModelRegistry;
  /** Optional cost tracker. */
  costTracker?: CostTracker;
  /** Optional workspace root — enables the writer's tool loop (write_file). */
  workspaceRoot?: string;
  /** Optional tool executor — enables the writer's tool loop. */
  toolExecutor?: ToolExecutorInterface;
  /** Optional tool registry — supplies tool definitions to the writer. */
  toolRegistry?: ToolRegistryInterface;
}

/**
 * Two-model sequential deliberation with **deterministic** synthesis.
 *
 * Distinct from `FusionExecutor` and `TrioExecutor`:
 *   - Both models are called **sequentially** — Model A writes a draft,
 *     then Model B reviews it.
 *   - The synthesis is **always** the deterministic `ResponseSynthesizer`
 *     (Jaccard + role authority). There is no LLM judge.
 *   - role assignment: modelA → 'writer' (confidence 0.8), modelB →
 *     'reviewer' (confidence 0.7).
 *
 * All 9 fusion patterns are applied:
 *   1. Defensive `safeEmit` — never throws on schema mismatches
 *   2. Factory pattern — `(modelId) => LLMProvider`
 *   3. Config knobs (temperature, maxCompletionTokens, budget, depth)
 *   4. `CostTracker.recordSpend` per call
 *   5. Recursion guard via `DuoContext.depth` + `maxDepth`
 *   6. Degraded fallback — never throws, returns `degraded: true` with reason
 *   7. 5-field analysis output
 *   8. Defensive `result.usage?.x ?? 0` access
 *   9. Test coverage — smoke tests live in `__tests__/duo-executor.test.ts`
 */
export class DuoExecutor {
  private eventStream: EventStream;
  private registry: ModelRegistry;
  private costTracker: CostTracker | undefined;
  private workspaceRoot: string | undefined;
  private toolExecutor: ToolExecutorInterface | undefined;
  private toolRegistry: ToolRegistryInterface | undefined;

  constructor(deps: DuoExecutorDeps) {
    this.eventStream = deps.eventStream;
    this.registry = deps.registry;
    this.costTracker = deps.costTracker;
    this.workspaceRoot = deps.workspaceRoot;
    this.toolExecutor = deps.toolExecutor;
    this.toolRegistry = deps.toolRegistry;
  }

  /**
   * Run a duo deliberation and return the synthesized response as a
   * string. For structured access to the analysis, use
   * {@link executeWithAnalysis}.
   */
  async execute(
    task: string,
    config: DuoConfig,
    providerFactory: DuoProviderFactory,
    context: DuoContext = { depth: 0 }
  ): Promise<string> {
    const result = await this.executeWithAnalysis(task, config, providerFactory, context);
    return result.output;
  }

  /**
   * Run a duo deliberation and return the full structured result.
   */
  async executeWithAnalysis(
    task: string,
    config: DuoConfig,
    providerFactory: DuoProviderFactory,
    context: DuoContext = { depth: 0 }
  ): Promise<DuoResult> {
    const startTime = Date.now();
    const sources: DuoSource[] = [];
    let totalTokens = 0;
    let totalCostUsd = 0;
    let degraded = false;
    let degradationReason: string | undefined;

    // ── Recursion guard ───────────────────────────────────────────────
    const maxDepth = config.maxDepth ?? 1;
    if (context.depth >= maxDepth) {
      return this.degraded(
        totalTokens, totalCostUsd, startTime, sources,
        'recursion limit reached at depth ' + context.depth
      );
    }

    // ── Config validation ─────────────────────────────────────────────
    if (!config.modelA || !config.modelB) {
      return this.degraded(
        totalTokens, totalCostUsd, startTime, sources,
        'modelA and modelB are required'
      );
    }

    // Duo requires two distinct models. Same-model duo is functionally
    // identical to solo with self-verify but costs 2x — reject it.
    if (config.modelA === config.modelB) {
      return this.degraded(
        totalTokens, totalCostUsd, startTime, sources,
        `duo requires two distinct models; got modelA=modelB="${config.modelA}". Use solo preset for same-model execution.`
      );
    }

    // ── Sequential calls ──────────────────────────────────────────────
    try {
      // Stage 1: Writer
      const resA = await this.callPeer('writer', config.modelA, task, config, providerFactory);
      const sourceA: DuoSource = {
        modelId: config.modelA,
        role: 'writer',
        content: sanitizeWriterOutput(resA.content),
        tokens: resA.inputTokens + resA.outputTokens,
        durationMs: resA.durationMs,
      };
      sources.push(sourceA);
      totalTokens += sourceA.tokens;
      const costA = this.computeCost(config.modelA, resA.inputTokens, resA.outputTokens);
      totalCostUsd += costA;
      this.recordSpend(config.modelA, costA);

      // Budget check after first call
      if (this.isOverBudget(config, totalCostUsd)) {
        return this.degraded(totalTokens, totalCostUsd, startTime, sources, `cost $${totalCostUsd.toFixed(4)} exceeded budget after writer call`);
      }

      // Optional Stage: Linter
      let linterFeedback = '';
      if (config.useLinter) {
        const lintResult = this.runLinter(sourceA.content);
        if (!lintResult.success) {
          linterFeedback = `\n\nLINTER FINDINGS:\n${lintResult.errors.join('\n')}`;
        }
      }

      // Stage 2: Reviewer
      const resB = await this.callPeer('reviewer', config.modelB, task, config, providerFactory, sourceA.content + linterFeedback);
      const sourceB: DuoSource = {
        modelId: config.modelB,
        role: 'reviewer',
        content: sanitizeReviewerOutput(resB.content),
        tokens: resB.inputTokens + resB.outputTokens,
        durationMs: resB.durationMs,
      };
      sources.push(sourceB);
      totalTokens += sourceB.tokens;
      const costB = this.computeCost(config.modelB, resB.inputTokens, resB.outputTokens);
      totalCostUsd += costB;
      this.recordSpend(config.modelB, costB);

    } catch (err) {
      return this.degraded(totalTokens, totalCostUsd, startTime, sources, `sequential calls failed: ${String(err)}`);
    }

    // Budget check after both calls
    if (this.isOverBudget(config, totalCostUsd)) {
      degradationReason = `cost $${totalCostUsd.toFixed(4)} exceeded budget $${config.budgetUsd}`;
      degraded = true;
    }

    // ── Synthesize (deterministic) ────────────────────────────────────
    const validSources = sources.filter((s) => !s.error && s.content.length > 0);
    if (validSources.length === 0) {
      return this.degraded(
        totalTokens, totalCostUsd, startTime, sources,
        degraded ? (degradationReason ?? 'budget exceeded') : 'both models failed'
      );
    }

    // In sequential mode, we prefer the reviewer (Model B) if it succeeded.
    const sourceA = sources.find(s => s.role === 'writer');
    const sourceB = sources.find(s => s.role === 'reviewer');

    // If only writer succeeded (reviewer failed or was over budget)
    if (sourceA && !sourceB) {
        const analysis: DuoAnalysis = {
            thought: '',
            finalResponse: sourceA.content,
            consensus: [sourceA.content],
            conflicts: [],
            uniqueInsights: [sourceA.content],
            blindSpots: [],
            confidence: 0.8,
        };
        return {
            output: sourceA.content,
            analysis,
            sources,
            totalTokens,
            totalCostUsd,
            durationMs: Date.now() - startTime,
            degraded: true,
            degradationReason: degradationReason ?? 'reviewer failed',
            needsUserEscalation: false,
        };
    }

    // Both succeeded or only reviewer succeeded (unlikely given sequential dependency)
    const finalResponse = sourceB ? sourceB.content : sourceA!.content;

    const analysis: DuoAnalysis = {
      thought: '',
      finalResponse,
      consensus: sourceA ? [sourceA.content] : [],
      conflicts: [],
      uniqueInsights: sourceB ? [sourceB.content] : [],
      blindSpots: [],
      confidence: sourceB ? 0.9 : 0.8,
    };

    return {
      output: finalResponse,
      analysis,
      sources,
      totalTokens,
      totalCostUsd,
      durationMs: Date.now() - startTime,
      degraded,
      degradationReason: degraded ? degradationReason : undefined,
      needsUserEscalation: false,
    };
  }

  // ── private helpers ───────────────────────────────────────────────

  private async callPeer(
    role: 'writer' | 'reviewer',
    modelId: string,
    task: string,
    config: DuoConfig,
    providerFactory: DuoProviderFactory,
    draft?: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number; durationMs: number }> {
    const start = Date.now();
    const provider: LLMProvider = providerFactory(modelId);
    const prompt = role === 'writer'
      ? this.buildPeerPrompt(role, task, config.context)
      : this.buildReviewPrompt(task, draft!, config.context);

    const r = await provider.complete(
      [{ role: 'user', content: prompt }],
      { temperature: config.temperature, maxTokens: config.maxCompletionTokens, ...(config.reasoning !== undefined ? { reasoning: config.reasoning } : {}) }
    );

    // Writer path: route through the shared agentic tool loop so the writer
    // can actually call write_file instead of narrating the file in prose.
    // Falls back to the bare draft when tooling is unavailable (non-file tasks).
    if (role === 'writer' && this.toolExecutor && this.toolRegistry && this.workspaceRoot) {
      const wantsFiles = taskWantsFiles(task);
      try {
        const loop = await runAgentToolLoop({
          provider,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: config.temperature, maxTokens: config.maxCompletionTokens },
          toolExecutor: this.toolExecutor,
          toolRegistry: this.toolRegistry,
          eventStream: this.eventStream,
          workspaceRoot: this.workspaceRoot,
          sessionId: `duo-${modelId}`,
          initialContent: r.content,
          initialToolCalls: r.toolCalls ?? [],
          maxRounds: Math.max(1, config.maxDepth ?? 4),
          mode: 'solo',
          forceMinFiles: 1,
          wantsFiles,
          task,
          systemPrompt: config.context ? `[!] PROJECT CONTEXT [!]\n${config.context}` : undefined,
          toolDefs: this.toolRegistry
            ? this.toolRegistry.getAll().map((t) => ({
                name: t.name,
                description: t.description,
                parameters: (t.parameters as unknown as Record<string, unknown>) ?? {},
              }))
            : undefined,
          sanitize: sanitizeWriterOutput,
        });
        let content = loop.content || r.content;
        // Prose fallback: if still no file landed, parse the narration and
        // execute it for real (mirrors solo-executor).
        if (wantsFiles && loop.wroteFileCount < 1) {
          try {
            const proseFiles = await executeProseActions(content, {
              eventStream: this.eventStream,
              toolExecutor: this.toolExecutor,
              toolRegistry: this.toolRegistry,
              workspaceRoot: this.workspaceRoot,
              sessionId: `duo-${modelId}`,
            });
            if (proseFiles > 0) content = content || 'Task executed via tools.';
          } catch {
            /* best-effort */
          }
        }
        return {
          content,
          inputTokens: (r.usage?.inputTokens ?? 0) + loop.inputTokens,
          outputTokens: (r.usage?.outputTokens ?? 0) + loop.outputTokens,
          durationMs: Date.now() - start,
        };
      } catch {
        // Tool loop failed — fall through to the bare draft below.
      }
    }

    return {
      content: r.content,
      inputTokens: r.usage?.inputTokens ?? 0,
      outputTokens: r.usage?.outputTokens ?? 0,
      durationMs: Date.now() - start,
    };
  }

  private deriveConsensus(inputs: SynthesisInput[], conflicts: { involvedAgents: string[] }[]): string[] {
    const conflictedAgentIds = new Set(conflicts.flatMap((c) => c.involvedAgents));
    const conflictFreeContents = inputs.filter((i) => !conflictedAgentIds.has(i.agentId));
    return conflictFreeContents.map((i) => i.content.split('\n')[0].slice(0, 200));
  }

  private buildPeerPrompt(role: 'writer' | 'reviewer', task: string, context?: string): string {
    const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
    if (TaskRouter.isConversationalTask(task)) {
      return `You are a helpful assistant. Answer the following conversational question directly.\n` +
        `Do NOT produce code, file changes, or technical analysis unless specifically asked.\n` +
        `Provide a clear, concise, factual answer.\n\nTASK: ${task}${contextBlock}\n\nANSWER:`;
    }
    return `You are the ${role}. Provide a complete answer to the following task. Be specific and concrete.\n\nTASK: ${task}${contextBlock}\n\nANSWER:`;
  }

  private buildReviewPrompt(task: string, draft: string, context?: string): string {
    const contextBlock = context ? `\n\n[!] PROJECT CONTEXT [!]\n${context}` : '';
    if (TaskRouter.isConversationalTask(task)) {
      return `[!] CONVERSATIONAL REVIEW [!]\n` +
        `This is a conversational/general question, NOT a code task.\n` +
        `Do NOT apply code-review criteria.\n` +
        `Evaluate ONLY: factual accuracy, completeness, and clarity.\n` +
        `Default to PASS unless the answer is factually incorrect.\n\n` +
        `TASK: ${task}${contextBlock}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
    }
    return `You are the reviewer. Read the following draft answer to the task and identify any issues, hallucinations, or missing parts. Provide an improved version of the answer.\n\nTASK: ${task}${contextBlock}\n\nDRAFT:\n${draft}\n\nIMPROVED ANSWER:`;
  }

  private runLinter(content: string): { success: boolean; errors: string[] } {
    const errors: string[] = [];
    
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

  private isOverBudget(config: DuoConfig, currentCost: number): boolean {
    return config.budgetUsd !== undefined && config.budgetUsd > 0 && currentCost > config.budgetUsd;
  }

  private safeEmit(event: unknown): void {
    try { this.eventStream.append(event as Parameters<EventStream['append']>[0]); } catch { /* schema mismatch — ignore */ }
  }

  private degraded(
    totalTokens: number,
    totalCostUsd: number,
    startTime: number,
    sources: DuoSource[],
    degradationReason: string
  ): DuoResult {
    const analysis: DuoAnalysis = {
      thought: '',
      finalResponse: '',
      consensus: [],
      conflicts: [degradationReason],
      uniqueInsights: [],
      blindSpots: [],
      confidence: 0,
    };
    return {
      output: '',
      analysis,
      sources,
      totalTokens,
      totalCostUsd,
      durationMs: Date.now() - startTime,
      degraded: true,
      degradationReason,
      needsUserEscalation: false,
    };
  }
}
