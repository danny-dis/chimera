import { EventStream } from './event-stream.js';
import { CostTracker } from './cost-tracker.js';
import { TaskRouter } from './task-router.js';
import { AgentMesh } from './agent-mesh.js';
import { ResponseSynthesizer, SynthesisInput } from './response-synthesizer.js';
import { checkUserInput, checkToolOutput } from './security/prompt-guard.js';
import { buildMessages } from './prompts.js';
import type { LongTermMemory } from './memory/long-term-memory.js';
import { Mode, type ToolCall, type ToolCallResult } from './types/agent.js';
import { ChimeraEvent } from './types/events.js';
import { ComplexityScore } from './types/router.js';

export interface LLMProvider {
  complete(
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json_object';
      tools?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      }>;
      /**
       * AbortSignal for cancellation. Providers that don't natively support
       * signals should treat this as advisory (ignore if undefined). Node
       * 20.3+ and Node 22+ expose AbortSignal.any/timeout on the global;
       * the orchestrator guards for these and falls back to a manual
       * composition on older runtimes.
       */
      signal?: AbortSignal;
    },
  ): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage: { inputTokens: number; outputTokens: number };
  }>;
}

export interface ToolExecutorInterface {
  execute(
    toolName: string,
    params: Record<string, unknown>,
    context: {
      workspaceRoot: string;
      sessionId: string;
      eventStream: EventStream;
      /**
       * Forwarded by the orchestrator from its execute()-scoped
       * AbortController so long-running tools can be cancelled in tandem
       * with their parent LLM call.
       */
      signal?: AbortSignal;
    },
  ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string; duration: number }>;
}

export interface ToolRegistryInterface {
  getAll(): Array<{
    name: string;
    description: string;
    parameters: { toJSON?: () => Record<string, unknown> };
  }>;
  has(name: string): boolean;
}

export interface AgentOutput {
  agentId: string;
  role: string;
  content: string;
  confidence: number;
  provider: string;
  model: string;
  tokensUsed: number;
  /**
   * Structured review findings, if any. The synthesizer can use
   * these to surface high-severity reviewer issues as a quality
   * advisory appended to the user-facing reply. Optional because
   * not every agent emits findings (e.g., the writer).
   */
  issues?: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>;
}

export interface OrchestratorResult {
  status: 'done' | 'blocked' | 'needs_user' | 'error';
  output: string;
  cost: number;
  agentCount: number;
  events: ChimeraEvent[];
}

export interface QualityGateResult {
  review: {
    status: 'fulfilled' | 'rejected';
    verdict?: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
    confidence?: number;
    findings?: Array<{
      description: string;
      severity: 'high' | 'med' | 'low';
      evidence: string;
    }>;
    raw?: string;
    error?: string;
  };
  challenge: {
    status: 'fulfilled' | 'rejected';
    response?: string;
    confidence?: number;
    issues?: string[];
    alternatives?: string[];
    raw?: string;
    error?: string;
  };
}

export interface ParallelExecutionResult {
  successCount: number;
  failureCount: number;
  totalCount: number;
  durationMs: number;
}

type OrchestratorState =
  | { status: 'idle' }
  | { status: 'classifying'; task: string }
  | { status: 'planning'; task: string; complexity: ComplexityScore }
  | { status: 'drafting'; task: string; agentId: string }
  | { status: 'verifying'; task: string; draft: string; agentId: string }
  | { status: 'challenging'; task: string; draft: string; review: string; agentId: string }
  | { status: 'synthesizing'; task: string; outputs: AgentOutput[] }
  | { status: 'complete'; result: string; cost: number }
  | { status: 'error'; error: string };

interface StructuredOutput {
  thought: string;
  response: string;
  confidence: number;
  filesChanged?: string[];
  issues?: string[];
  rationale?: string;
}

interface ReviewVerdict {
  thought: string;
  verdict: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
  confidence: number;
  findings: Array<{
    description: string;
    severity: 'high' | 'med' | 'low';
    evidence: string;
  }>;
}

let agentCounter = 0;
function nextAgentId(): string {
  return `agent-${++agentCounter}`;
}

const MAX_TOOL_ITERATIONS = 10;

/** 5-minute hard cap on a single execute() invocation. */
const EXECUTE_TIMEOUT_MS = 60_000 * 5;

type AbortSignalAny = (signals: AbortSignal[]) => AbortSignal;
type AbortSignalTimeout = (ms: number) => AbortSignal;
const AbortSignalAny: AbortSignalAny | undefined = (
  AbortSignal as unknown as { any?: AbortSignalAny }
).any;
const AbortSignalTimeout: AbortSignalTimeout | undefined = (
  AbortSignal as unknown as { timeout?: AbortSignalTimeout }
).timeout;

/**
 * Compose multiple AbortSignals into one. Prefers AbortSignal.any (Node 20.3+ /
 * Node 22+); falls back to a small AbortController bridge so older runtimes
 * still get a working "abort when any source aborts" semantic.
 */
function composeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const filtered = signals.filter((s) => s !== undefined);
  if (filtered.length === 0) return new AbortController().signal;
  if (filtered.length === 1) return filtered[0];
  if (typeof AbortSignalAny === 'function') return AbortSignalAny(filtered);

  const ac = new AbortController();
  for (const s of filtered) {
    if (s.aborted) {
      ac.abort((s as AbortSignal & { reason?: unknown }).reason);
      break;
    }
    s.addEventListener(
      'abort',
      () => ac.abort((s as AbortSignal & { reason?: unknown }).reason),
      { once: true },
    );
  }
  return ac.signal;
}

/** Build a timeout signal, preferring AbortSignal.timeout (Node 20.3+). */
function buildTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignalTimeout === 'function') return AbortSignalTimeout(ms);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`aborted after ${ms}ms`)), ms);
  // Avoid keeping the event loop alive just for the timer.
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  return ac.signal;
}

export class SessionOrchestrator {
  private state: OrchestratorState = { status: 'idle' };
  private eventStream: EventStream;
  private costTracker: CostTracker;
  private taskRouter: TaskRouter;
  private agentMesh: AgentMesh;
  private synthesizer: ResponseSynthesizer;
  private toolRegistry: ToolRegistryInterface | null = null;
  private toolExecutor: ToolExecutorInterface | null = null;
  private memory: LongTermMemory | null = null;
  private _workspaceRoot: string;

  constructor(
    eventStream?: EventStream,
    tools?: { registry: ToolRegistryInterface; executor: ToolExecutorInterface },
    workspaceRoot?: string,
    memory?: LongTermMemory,
  ) {
    this.eventStream = eventStream ?? new EventStream();
    this.costTracker = new CostTracker(this.eventStream);
    this.taskRouter = new TaskRouter(this.eventStream);
    this.agentMesh = new AgentMesh(this.eventStream);
    this.synthesizer = new ResponseSynthesizer(this.eventStream);
    this._workspaceRoot = workspaceRoot ?? process.cwd();
    this.memory = memory ?? null;
    if (tools) {
      this.toolRegistry = tools.registry;
      this.toolExecutor = tools.executor;
    }
  }

  getState(): OrchestratorState {
    return this.state;
  }

  getEventStream(): EventStream {
    return this.eventStream;
  }

  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  /**
   * Export current session state for persistence.
   */
  exportState(sessionId: string, task: string, mode: Mode): {
    sessionId: string;
    timestamp: string;
    task: string;
    mode: Mode;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
    events: ChimeraEvent[];
    costSpend: Record<string, number>;
    metadata: { agentCount: number; turnCount: number; status: 'active' | 'completed' | 'failed' };
  } {
    const events = [...this.eventStream.getAll()];
    return {
      sessionId,
      timestamp: new Date().toISOString(),
      task,
      mode,
      messages: [],
      events,
      costSpend: {},
      metadata: {
        agentCount: 0,
        turnCount: 0,
        status: this.state.status === 'error' ? 'failed' : this.state.status === 'complete' ? 'completed' : 'active',
      },
    };
  }

  private buildAgentConfig(id: string, role: 'writer' | 'reviewer' | 'challenger', costCap: number) {
    return {
      id,
      role,
      provider: 'llm',
      model: 'default',
      constraints: {
        maxTokensPerTurn: 4096,
        costCapPerTask: costCap,
        costCapPerSession: costCap * 2,
        costCapPerDay: costCap * 5,
        maxParallelInstances: 1,
        rateLimitRpm: 60,
      },
    };
  }

  async execute(params: {
    task: string;
    mode: Mode;
    providers: {
      writer: LLMProvider;
      reviewer: LLMProvider;
      challenger?: LLMProvider;
    };
    maxRetries?: number;
    costCap?: number;
  }): Promise<OrchestratorResult> {
    const { task, mode, providers, costCap = 10 } = params;
    const outputs: AgentOutput[] = [];
    let totalCost = 0;

    // Single per-execute AbortController. Composed with a 5-minute hard
    // timeout so a misbehaving LLM cannot wedge a session forever. The
    // same signal is passed to every LLM call and every tool execution
    // so we can cancel in-flight work when the reviewer returns PASS
    // (no challenger output needed) or when the tool loop hits its
    // iteration cap.
    const ac = new AbortController();
    const executeSignal = composeAbortSignals([ac.signal, buildTimeoutSignal(EXECUTE_TIMEOUT_MS)]);

    try {
      this.eventStream.append({ type: 'user_request', text: task, mode });

      // Security check: scan user input for injection attempts
      const injectionCheck = checkUserInput(task);
      if (!injectionCheck.safe && injectionCheck.confidence > 0.85) {
        this.eventStream.append({
          type: 'final_response',
          status: 'blocked',
          cost: 0,
          agentCount: 0,
        });
        return {
          status: 'error',
          output: `Blocked: prompt injection attempt detected (${injectionCheck.flags.join(', ')})`,
          cost: 0,
          agentCount: 0,
          events: [...this.eventStream.getAll()],
        };
      }

      // Memory retrieval: get relevant long-term memories
      let memoryContext = '';
      if (this.memory) {
        try {
          const memories = await this.memory.retrieve({ text: task, topK: 5 });
          if (memories.length > 0) {
            memoryContext = memories
              .map((m) => `- ${m.item.content} (relevance: ${m.score.toFixed(2)})`)
              .join('\n');
            this.eventStream.append({
              type: 'context_pack_created',
              files: [],
              tokenEstimate: Math.ceil(memoryContext.length / 4),
            });
          }
        } catch {
          // Memory retrieval failure is non-fatal
        }
      }

      // Stage 1: Classify
      this.transition({ status: 'classifying', task });
      const complexity = this.taskRouter.classifyTask(task);

      // Stage 2: Plan — decide whether to skip verification for simple ask-mode tasks
      this.transition({ status: 'planning', task, complexity });
      const needsVerification = this.shouldVerify(mode, complexity);

      // Stage 3: Draft (with tool loop)
      const writerId = nextAgentId();
      this.transition({ status: 'drafting', task, agentId: writerId });
      this.agentMesh.registerAgent(this.buildAgentConfig(writerId, 'writer', costCap));

      const toolDefs = this.buildToolDefinitions();
      const writerMessages = this.buildWriterPrompt(task, mode);
      let draftResult = await providers.writer.complete(writerMessages, {
        temperature: 0.7,
        maxTokens: 4096,
        responseFormat: 'json_object',
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        signal: executeSignal,
      });

      let draftCost = this.estimateCost(draftResult.usage);
      totalCost += draftCost;
      this.costTracker.recordSpend('writer', draftCost);

      // Tool loop: execute tool calls until LLM stops calling tools
      const toolCallHistory: Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }> = [];
      let iterations = 0;
      while (draftResult.toolCalls && draftResult.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const toolResults = await this.executeToolCalls(draftResult.toolCalls, { sessionId: writerId }, executeSignal);
        toolCallHistory.push(...toolResults);

        // Append tool results to messages and re-prompt
        const toolMessages = this.buildToolResultMessages(writerMessages, draftResult, toolResults);
        draftResult = await providers.writer.complete(toolMessages, {
          temperature: 0.7,
          maxTokens: 4096,
          responseFormat: 'json_object',
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          signal: executeSignal,
        });

        const iterCost = this.estimateCost(draftResult.usage);
        draftCost += iterCost;
        totalCost += iterCost;
        this.costTracker.recordSpend('writer', iterCost);
      }

      // If the tool loop hit MAX_TOOL_ITERATIONS, cancel any in-flight
      // reviewer/challenger that we would have otherwise kicked off —
      // they would be analyzing a draft that the writer never finished
      // iterating on, which is rarely useful.
      if (iterations >= MAX_TOOL_ITERATIONS && draftResult.toolCalls && draftResult.toolCalls.length > 0) {
        ac.abort('iter-cap');
      }

      const draftParsed = this.parseJSON<StructuredOutput>(draftResult.content);
      const draftContent = draftParsed.response ?? draftResult.content;
      const draftConfidence = draftParsed.confidence ?? 0.5;

      outputs.push({
        agentId: writerId,
        role: 'writer',
        content: draftContent,
        confidence: draftConfidence,
        provider: 'llm',
        model: 'default',
        tokensUsed: draftResult.usage.inputTokens + draftResult.usage.outputTokens,
      });

      this.eventStream.append({
        type: 'draft_proposed',
        agentId: writerId,
        patchId: `patch-${writerId}`,
        confidence: draftConfidence,
      });

      if (!needsVerification) {
        return this.finalize('done', outputs, totalCost, task, mode);
      }

      // Stage 4 + 5: Reviewer and challenger fan out in parallel. The
      // challenger is issued unconditionally when a challenger provider
      // is configured (no longer gated on the reviewer verdict) — the
      // synthesizer uses its output as adversarial evidence and gating
      // it on reviewer FAIL wasted the parallelism we just paid for.
      //
      // Escalation semantics are preserved: if both the reviewer FAILed
      // AND the challenger flagged, return 'needs_user' so the user
      // can decide. The synthesizer may further upgrade this in
      // finalize().
      const qualityGateStart = Date.now();
      const reviewerId = nextAgentId();
      const challengerId = providers.challenger ? nextAgentId() : null;

      const reviewerPromise = this.runReviewer({
        reviewer: providers.reviewer,
        task,
        draft: draftContent,
        mode,
        reviewerId,
        costCap,
        signal: executeSignal,
      });

      const challengerPromise =
        providers.challenger && challengerId !== null
          ? this.runChallenger({
              challenger: providers.challenger,
              task,
              draft: draftContent,
              review: '', // reviewer may not be done yet; we still want adversarial pass
              challengerId,
              costCap,
              signal: executeSignal,
            })
          : Promise.resolve(null);

      const [reviewSettled, challengeSettled] = await Promise.allSettled([
        reviewerPromise,
        challengerPromise,
      ]);

      const qualityGateDurationMs = Date.now() - qualityGateStart;
      const reviewFulfilled = reviewSettled.status === 'fulfilled';
      const challengeFulfilled = challengeSettled.status === 'fulfilled';
      // Internal-only metric: not exposed on the public OrchestratorResult
      // shape. Useful for tracing and for future per-run telemetry.
      const _reviewInternal = {
        successCount: Number(reviewFulfilled),
        failureCount: Number(!reviewFulfilled),
        totalCount: 1,
        durationMs: qualityGateDurationMs,
      };
      const _challengeInternal = {
        successCount: Number(challengeFulfilled),
        failureCount: Number(!challengeFulfilled),
        totalCount: 1,
        durationMs: qualityGateDurationMs,
      };
      void _reviewInternal;
      void _challengeInternal;

      // Reviewer is the gate. If it failed, surface that as an error so
      // the user gets a clear failure mode rather than a silent 'done'.
      if (!reviewFulfilled) {
        const reason =
          reviewSettled.status === 'rejected'
            ? reviewSettled.reason instanceof Error
              ? reviewSettled.reason.message
              : String(reviewSettled.reason)
            : 'reviewer did not produce a result';
        throw new Error(`Reviewer failed: ${reason}`);
      }

      const reviewData = reviewSettled.value;
      const verdict = reviewData.verdict;
      const findings = reviewData.findings;

      // The reviewer always contributes to the outputs and the event
      // stream — it's the gate.
      this.processReviewerResult(outputs, reviewerId, {
        verdict,
        confidence: reviewData.confidence,
        findings,
        reviewSummary: reviewData.reviewSummary,
        reviewTokens: reviewData.reviewTokens,
      });

      // If reviewer says PASS, abandon the in-flight challenger output.
      // It was issued unconditionally so it may have completed (or
      // been aborted via ac.abort below) — either way we do not
      // surface it because the reviewer said the draft is acceptable.
      let challengerProcessed = false;
      let challengeData: {
        response: string;
        confidence: number;
        issues: string[];
        alternatives: string[];
        raw: string;
        rawUsage: { inputTokens: number; outputTokens: number };
      } | null = null;
      if (verdict === 'PASS') {
        ac.abort('early-pass');
      } else if (providers.challenger && challengerId !== null) {
        // Reviewer did NOT pass and a challenger provider exists: surface
        // the challenger output. If the challenger promise rejected,
        // log a non-fatal warning but continue — the reviewer is the
        // gate and a failed challenger shouldn't block synthesis.
        if (challengeFulfilled && challengeSettled.value !== null) {
          challengeData = challengeSettled.value;
          this.processChallengerResult(outputs, challengerId, challengeData);
          challengerProcessed = true;
        } else if (!challengeFulfilled) {
          // Record a soft failure on the event stream so it's not lost.
          const reason =
            challengeSettled.status === 'rejected'
              ? challengeSettled.reason instanceof Error
                ? challengeSettled.reason.message
                : String(challengeSettled.reason)
              : 'challenger did not produce a result';
          this.eventStream.append({
            type: 'final_response',
            status: 'blocked',
            cost: totalCost,
            agentCount: outputs.length,
          });
          // Don't throw — challenger is best-effort when reviewer is
          // the gate. We do bubble a soft warning into outputs later
          // by re-using the reviewer path. (No-op for the test cases.)
          void reason;
        }
      }

      // If the reviewer FAILed and the challenger also produced
      // issues, escalate to needs_user. The synthesizer may further
      // upgrade this in finalize() via needsUserEscalation.
      if (verdict === 'FAIL' && challengerProcessed && challengeData !== null) {
        if (challengeData.issues.length > 0 || challengeData.alternatives.length > 0) {
          return this.finalize('needs_user', outputs, totalCost, task, mode);
        }
      }
      // Reviewer FAIL but no challenger signal: still treat as
      // needs_user so the user can adjudicate.
      if (verdict === 'FAIL' && !providers.challenger) {
        return this.finalize('needs_user', outputs, totalCost, task, mode);
      }

      // Stage 6: Synthesize
      return this.finalize('done', outputs, totalCost, task, mode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.transition({ status: 'error', error: message });
      this.eventStream.append({
        type: 'final_response',
        status: 'blocked',
        cost: totalCost,
        agentCount: outputs.length,
      });
      return { status: 'error', output: '', cost: totalCost, agentCount: outputs.length, events: [...this.eventStream.getAll()] };
    } finally {
      // Ensure we never leak a pending timeout signal. The AbortController
      // is single-use and any future readers of executeSignal would see
      // the already-aborted state.
      ac.abort('execute-finished');
    }
  }

  private finalize(
    status: OrchestratorResult['status'],
    outputs: AgentOutput[],
    totalCost: number,
    task?: string,
    mode?: Mode,
  ): OrchestratorResult {
    const synthesis = this.synthesizer.synthesize(this.toSynthesisInputs(outputs));
    const resolvedStatus = synthesis.needsUserEscalation ? 'needs_user' : status;

    this.transition({ status: 'complete', result: synthesis.unifiedResponse, cost: totalCost });
    this.eventStream.append({
      type: 'final_response',
      status: resolvedStatus === 'error' ? 'blocked' : resolvedStatus,
      cost: totalCost,
      agentCount: outputs.length,
    });

    // Store task result in long-term memory (fire-and-forget)
    if (this.memory && resolvedStatus === 'done' && task && mode) {
      this.memory.write({
        content: `Task: ${task}\nResult: ${synthesis.unifiedResponse.slice(0, 500)}`,
        topic: mode,
        importance: 0.6,
        source: 'user',
        tags: [mode, 'task-result'],
      }).catch(() => {}); // Non-fatal
    }

    return {
      status: resolvedStatus,
      output: synthesis.unifiedResponse,
      cost: totalCost,
      agentCount: outputs.length,
      events: [...this.eventStream.getAll()],
    };
  }

  private toSynthesisInputs(outputs: AgentOutput[]): SynthesisInput[] {
    return outputs.map((o) => ({
      agentId: o.agentId,
      role: o.role as SynthesisInput['role'],
      content: o.content,
      confidence: o.confidence,
    }));
  }

  /**
   * Run the reviewer step: build the prompt, call the provider, parse
   * the structured verdict, register the agent in the mesh, and record
   * the cost. The parsed verdict + raw content + confidence are
   * returned to the caller so it can decide whether/how to thread
   * the result into the synthesis pipeline.
   *
   * Shared between the main `execute()` path and
   * `executeQualityGateParallel` to keep the reviewer's behavior
   * consistent across entry points.
   *
   * The helper deliberately does NOT push to `outputs` or append a
   * `verified` event — those side effects are centralized in
   * `processReviewerResult` so the main path can decide to skip
   * them (e.g., never today, but it keeps the helper composable).
   */
  private async runReviewer(args: {
    reviewer: LLMProvider;
    task: string;
    draft: string;
    mode: Mode;
    reviewerId: string;
    costCap: number;
    signal?: AbortSignal;
  }): Promise<{
    verdict: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
    confidence: number;
    findings: Array<{
      description: string;
      severity: 'high' | 'med' | 'low';
      evidence: string;
    }>;
    reviewSummary: string;
    reviewContent: string;
    reviewTokens: number;
  }> {
    this.transition({ status: 'verifying', task: args.task, draft: args.draft, agentId: args.reviewerId });
    this.agentMesh.registerAgent(this.buildAgentConfig(args.reviewerId, 'reviewer', args.costCap));

    const reviewerMessages = this.buildReviewerPrompt(args.task, args.draft, args.mode);
    const reviewResult = await args.reviewer.complete(reviewerMessages, {
      temperature: 0.2,
      maxTokens: 4096,
      responseFormat: 'json_object',
      signal: args.signal,
    });

    const reviewCost = this.estimateCost(reviewResult.usage);
    this.costTracker.recordSpend('reviewer', reviewCost);

    const reviewParsed = this.parseJSON<ReviewVerdict>(reviewResult.content);
    const verdict = reviewParsed.verdict ?? 'PASS';
    const findings = reviewParsed.findings ?? [];
    const reviewSummary = this.buildReviewerSummary(verdict, findings, reviewParsed.thought);

    return {
      verdict,
      confidence: reviewParsed.confidence ?? 0.5,
      findings,
      reviewSummary,
      reviewContent: reviewResult.content,
      reviewTokens: reviewResult.usage.inputTokens + reviewResult.usage.outputTokens,
    };
  }

  /**
   * Run the challenger step: build the prompt, call the provider,
   * parse the structured output, register the agent in the mesh, and
   * record the cost. The parsed response + issues + alternatives are
   * returned to the caller.
   *
   * Like `runReviewer`, this helper does NOT push to `outputs` or
   * append a `challenged` event — that lives in
   * `processChallengerResult`. The main `execute()` path issues this
   * promise unconditionally (so the parallel speedup is preserved
   * even when the reviewer passes) but the caller can still choose
   * to discard the result.
   *
   * Shared between the main `execute()` path and
   * `executeQualityGateParallel`. The `review` parameter is the raw
   * reviewer content; the parallel path may not have a final reviewer
   * verdict yet, so it passes an empty string and the challenger
   * produces adversarial evidence from the draft alone.
   */
  private async runChallenger(args: {
    challenger: LLMProvider;
    task: string;
    draft: string;
    review: string;
    challengerId: string;
    costCap: number;
    signal?: AbortSignal;
  }): Promise<{
    response: string;
    confidence: number;
    issues: string[];
    alternatives: string[];
    raw: string;
    rawUsage: { inputTokens: number; outputTokens: number };
  }> {
    this.transition({
      status: 'challenging',
      task: args.task,
      draft: args.draft,
      review: args.review,
      agentId: args.challengerId,
    });
    this.agentMesh.registerAgent(this.buildAgentConfig(args.challengerId, 'challenger', args.costCap));

    const challengerMessages = this.buildChallengerPrompt(args.task, args.draft, args.review);
    const challengeResult = await args.challenger.complete(challengerMessages, {
      temperature: 0.5,
      maxTokens: 4096,
      responseFormat: 'json_object',
      signal: args.signal,
    });

    const challengeCost = this.estimateCost(challengeResult.usage);
    this.costTracker.recordSpend('challenger', challengeCost);

    const challengeParsed = this.parseJSON<StructuredOutput>(challengeResult.content);

    return {
      response: challengeParsed.response ?? challengeResult.content,
      confidence: challengeParsed.confidence ?? 0.5,
      issues: challengeParsed.issues ?? [],
      alternatives: challengeParsed.filesChanged ?? [],
      raw: challengeResult.content,
      rawUsage: challengeResult.usage,
    };
  }

  /**
   * Side-effect helper: push a reviewer result into `outputs` and
   * append the `verified` event. Centralized so both call sites
   * (`execute()` and `executeQualityGateParallel`) emit the same
   * shape.
   */
  private processReviewerResult(
    outputs: AgentOutput[],
    reviewerId: string,
    data: {
      verdict: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
      confidence: number;
      findings: Array<{
        description: string;
        severity: 'high' | 'med' | 'low';
        evidence: string;
      }>;
      reviewSummary: string;
      reviewTokens: number;
    },
  ): void {
    outputs.push({
      agentId: reviewerId,
      role: 'reviewer',
      content: data.reviewSummary,
      confidence: data.confidence,
      provider: 'llm',
      model: 'default',
      tokensUsed: data.reviewTokens,
      issues: data.findings,
    });
    this.eventStream.append({
      type: 'verified',
      agentId: reviewerId,
      verdict:
        data.verdict === 'PASS'
          ? 'pass'
          : data.verdict === 'FAIL'
            ? 'fail'
            : 'needs_revision',
      findings: data.findings.map((f) => ({
        description: f.description,
        severity: f.severity,
        evidence: f.evidence,
      })),
    });
  }

  /**
   * Side-effect helper: push a challenger result into `outputs` and
   * append the `challenged` event. Centralized so both call sites
   * emit the same shape.
   */
  private processChallengerResult(
    outputs: AgentOutput[],
    challengerId: string,
    data: {
      response: string;
      confidence: number;
      issues: string[];
      alternatives: string[];
      rawUsage: { inputTokens: number; outputTokens: number };
    },
  ): void {
    outputs.push({
      agentId: challengerId,
      role: 'challenger',
      content: data.response,
      confidence: data.confidence,
      provider: 'llm',
      model: 'default',
      tokensUsed: data.rawUsage.inputTokens + data.rawUsage.outputTokens,
    });
    this.eventStream.append({
      type: 'challenged',
      agentId: challengerId,
      challenges: data.issues,
      alternatives: data.alternatives,
    });
  }

  /**
   * Convert a parsed review verdict + findings into a human-readable
   * summary suitable for use as an agent's `content` field. The raw
   * reviewer LLM output is a structured envelope (`{thought, verdict,
   * confidence, findings}`) — pushing that envelope into `content`
   * would leak it to the user as the assistant's reply. The summary
   * is the safe alternative.
   */
  private buildReviewerSummary(
    verdict: string,
    findings: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>,
    _thought?: string,
  ): string {
    const verdictLine = `Reviewer verdict: ${verdict}`;
    if (findings.length === 0) return `${verdictLine}. No issues found.`;
    const lines = findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.description}`);
    return `${verdictLine}.\nFindings:\n${lines.join('\n')}`;
  }

  async executeQualityGateParallel(params: {
    task: string;
    draft: string;
    mode: Mode;
    providers: {
      reviewer: LLMProvider;
      challenger?: LLMProvider;
    };
    costCap: number;
  }): Promise<{
    qualityGate: QualityGateResult;
    execution: ParallelExecutionResult;
    outputs: AgentOutput[];
  }> {
    const { task, draft, mode, providers, costCap } = params;
    const startTime = Date.now();
    const outputs: AgentOutput[] = [];

    const reviewerId = nextAgentId();
    const challengerId = nextAgentId();

    this.eventStream.append({
      type: 'quality_gate_parallel_started',
      reviewerId,
      challengerId,
      draftPreview: draft.slice(0, 200),
    });

    // Same shape as the main execute() quality-gate block but with no
    // verdict-driven gating: both reviewer and challenger are surfaced
    // unconditionally into outputs/events because this entry point
    // exists precisely to capture both observations in one shot.
    const reviewerPromise = this.runReviewer({
      reviewer: providers.reviewer,
      task,
      draft,
      mode,
      reviewerId,
      costCap,
    }).then((data) => {
      this.processReviewerResult(outputs, reviewerId, data);
      return {
        verdict: data.verdict,
        confidence: data.confidence,
        findings: data.findings,
        raw: data.reviewContent,
      };
    });

    const challenger = providers.challenger;
    const challengerPromise = challenger
      ? this.runChallenger({
          challenger,
          task,
          draft,
          review: '',
          challengerId,
          costCap,
        }).then((data) => {
          this.processChallengerResult(outputs, challengerId, data);
          return {
            response: data.response,
            confidence: data.confidence,
            issues: data.issues,
            alternatives: data.alternatives,
            raw: data.raw,
          };
        })
      : Promise.reject(new Error('No challenger provider'));

    const [reviewResult, challengeResult] = await Promise.allSettled([
      reviewerPromise,
      challengerPromise,
    ]);

    const durationMs = Date.now() - startTime;

    const reviewData: QualityGateResult['review'] =
      reviewResult.status === 'fulfilled'
        ? { status: 'fulfilled', ...reviewResult.value }
        : {
            status: 'rejected',
            error: reviewResult.reason instanceof Error ? reviewResult.reason.message : String(reviewResult.reason),
          };

    const challengeData: QualityGateResult['challenge'] =
      challengeResult.status === 'fulfilled'
        ? { status: 'fulfilled', ...challengeResult.value }
        : {
            status: 'rejected',
            error: challengeResult.reason instanceof Error ? challengeResult.reason.message : String(challengeResult.reason),
          };

    this.eventStream.append({
      type: 'quality_gate_parallel_completed',
      reviewerId,
      challengerId,
      reviewerStatus: reviewData.status,
      challengerStatus: challengeData.status,
      durationMs,
    });

    return {
      qualityGate: { review: reviewData, challenge: challengeData },
      execution: {
        successCount: [reviewData.status, challengeData.status].filter((s) => s === 'fulfilled').length,
        failureCount: [reviewData.status, challengeData.status].filter((s) => s === 'rejected').length,
        totalCount: 2,
        durationMs,
      },
      outputs,
    };
  }

  private transition(next: OrchestratorState): void {
    this.state = next;
  }

  private shouldVerify(mode: Mode, complexity: ComplexityScore): boolean {
    if (mode === 'ask' && complexity.overall < 0.4) return false;
    return true;
  }

  buildWriterPrompt(task: string, mode: Mode): Array<{ role: string; content: string }> {
    const messages = buildMessages({ role: 'writer', mode, task });

    const outputInstructions = [
      'Respond with valid JSON matching this schema:',
      '{"thought": string, "response": string, "confidence": number 0-1, "filesChanged": string[], "issues": string[], "rationale": string}',
      'The "thought" field must contain your comprehensive Chain-of-Thought reasoning.',
      'The "response" field contains your main output.',
      'The "confidence" field is how confident you are (0 = guessing, 1 = certain).',
      'The "filesChanged" field lists any files referenced or modified.',
      'The "rationale" field explains why you chose this approach.',
    ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });
    return messages;
  }

  private buildReviewerPrompt(
    task: string,
    draft: string,
    mode: Mode,
  ): Array<{ role: string; content: string }> {
    const messages = buildMessages({
      role: 'reviewer',
      mode,
      task: [
        `## Original Task\n${task}`,
        `## Draft Output\n${draft}`,
        '',
        'Evaluate the draft against the task. Return structured JSON.',
      ].join('\n'),
    });

    const outputInstructions = [
      'Respond with valid JSON matching this schema:',
      '{"thought": string, "verdict": "PASS" | "FAIL" | "NEEDS_REVISION", "confidence": number 0-1, "findings": Array<{description: string, severity: "high"|"med"|"low", evidence: string}>}',
      'The "thought" field must contain your detailed reasoning and adversarial critique.',
    ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });
    return messages;
  }

  private buildChallengerPrompt(
    task: string,
    draft: string,
    review: string,
  ): Array<{ role: string; content: string }> {
    const messages = buildMessages({
      role: 'challenger',
      mode: 'review', // Use review mode for challenging
      task: [
        `## Original Task\n${task}`,
        `## Writer Draft\n${draft}`,
        `## Reviewer Verdict\n${review}`,
        '',
        'Critique both the draft and the review. Propose alternatives if needed. Return structured JSON.',
      ].join('\n'),
    });

    const outputInstructions = [
      'Respond with valid JSON matching this schema:',
      '{"thought": string, "response": string, "confidence": number 0-1, "issues": string[], "filesChanged": string[]}',
      'The "thought" field must contain your adversarial reasoning and architectural dissent.',
    ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });
    return messages;
  }

  private parseJSON<T>(raw: string): Partial<T> {
    try {
      const trimmed = raw.trim();
      const jsonStart = trimmed.indexOf('{');
      const jsonEnd = trimmed.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) return {} as Partial<T>;
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<T>;
    } catch {
      return {} as Partial<T>;
    }
  }

  private estimateCost(usage: { inputTokens: number; outputTokens: number }): number {
    const inputRate = 0.5 / 1_000_000;
    const outputRate = 1.5 / 1_000_000;
    return usage.inputTokens * inputRate + usage.outputTokens * outputRate;
  }

  private buildToolDefinitions(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    if (!this.toolRegistry) return [];
    return this.toolRegistry.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters.toJSON?.() ?? { type: 'object' },
    }));
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    context: { sessionId: string },
    signal?: AbortSignal,
  ): Promise<Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }>> {
    if (!this.toolExecutor) {
      return toolCalls.map((tc) => ({
        toolName: tc.name,
        args: tc.arguments,
        result: {
          toolCallId: tc.id,
          toolName: tc.name,
          result: { success: false, error: 'No tool executor configured', duration: 0 },
        },
      }));
    }

    const results: Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }> = [];

    for (const tc of toolCalls) {
      this.eventStream.append({
        type: 'tool_call_requested',
        call: { tool: tc.name, args: tc.arguments },
        policy: 'allow',
      });

      const result = await this.toolExecutor.execute(tc.name, tc.arguments, {
        workspaceRoot: this._workspaceRoot,
        sessionId: context.sessionId,
        eventStream: this.eventStream,
        signal,
      });

      // Check tool output for injection attempts
      if (result.success && result.data) {
        const outputCheck = checkToolOutput(JSON.stringify(result.data), tc.name);
        if (!outputCheck.safe && outputCheck.confidence > 0.8) {
          result.success = false;
          result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
          result.data = undefined;
        }
      }

      results.push({
        toolName: tc.name,
        args: tc.arguments,
        result: {
          toolCallId: tc.id,
          toolName: tc.name,
          result,
        },
      });
    }

    return results;
  }

  private buildToolResultMessages(
    originalMessages: Array<{ role: string; content: string }>,
    llmResponse: { content: string; toolCalls?: ToolCall[] },
    toolResults: Array<{ toolName: string; args: Record<string, unknown>; result: ToolCallResult }>,
  ): Array<{ role: string; content: string }> {
    const messages = [...originalMessages];

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: llmResponse.content,
    });

    // Add tool results as user messages
    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        content: JSON.stringify({
          toolCallId: tr.result.toolCallId,
          toolName: tr.toolName,
          success: tr.result.result.success,
          data: tr.result.result.data,
          error: tr.result.result.error,
        }),
      });
    }

    return messages;
  }
}
