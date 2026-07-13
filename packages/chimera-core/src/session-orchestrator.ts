import { EventStream } from './event-stream.js';
import * as path from 'path';
import { existsSync } from 'fs';
import { CostTracker } from './cost-tracker.js';
import { TaskRouter } from './task-router.js';
import { AgentMesh } from './agent-mesh.js';
import { ResponseSynthesizer, SynthesisInput } from './response-synthesizer.js';
import { checkUserInput, checkToolOutput } from './security/prompt-guard.js';
import { buildMessages, buildConversationalMessages, buildWorkflowGeneratorPrompt, CHIMERA_CORE_IDENTITY, AGENT_PROMPTS, COMPACT_CORE_IDENTITY, compactAgentPrompt, SMALL_MODEL_GUIDANCE } from './prompts.js';
import { AuditLog } from './security/audit-log.js';
import { BiomeLinter } from './coordinator/biome-linter.js';
import { sanitizeWriterOutput, sanitizeReviewerOutput } from './coordinator/output-sanitizer.js';
import { expectedPathFromTask } from './coordinator/path-from-task.js';
import type { LongTermMemory } from './memory/long-term-memory.js';
import { Mode, type ToolCall, type ToolCallResult } from './types/agent.js';
import { zodToJsonSchema } from './zod-json.js';

/**
 * Cross-mode validation: which presets are valid for each mode.
 * Invalid combinations are wasteful (e.g. ask + fusion burns tokens for zero benefit).
 * 'auto' preset bypasses this validation since it self-selects.
 */
const VALID_MODE_PRESET_COMBOS: Record<Mode, readonly DeliberationMode[]> = {
  ask:    ['solo'],
  plan:   ['solo', 'duo'],
  code:   ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'],
  debug:  ['auto', 'solo', 'duo', 'trio', 'fusion', 'swarm'],
  review: ['auto', 'duo', 'trio', 'fusion', 'swarm'],
  oal:    ['solo'],
  auto:   ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'],
};
import { ChimeraEvent } from './types/events.js';
import { ComplexityScore } from './types/router.js';
import { ContextEngine, RelayRacing, HandoffProtocol, ToolContextRelay } from '@chimera/context';
import { runCompactionPipeline } from '@chimera/context';
import { BudgetEnforcer, type BudgetCheckResult } from '@chimera/providers';
import { RateLimiter } from '@chimera/providers';
import type { ModelRegistry } from '@chimera/providers';
import { discoverInstructions, buildInstructionContext } from './instruction-discovery.js';
import { detectProjectContext } from './project-detection.js';
import { DeliberationEngine } from './coordinator/deliberation/engine.js';
import { countSourceFiles } from './coordinator/agent-tool-loop.js';
import type { DeliberationConfig, DeliberationMode, DeliberationResult } from './coordinator/deliberation/types.js';
import { buildPool, inferCapabilities, coreToolsForTier, contextBudgetForTier } from './coordinator/model-capabilities.js';
import type { MemoryPersistence } from './memory/memory-persistence.js';
import type { AutoExtractService } from './memory/auto-extract.js';
import type { RecallService } from './memory/recall-service.js';
import type { AutoDreamService } from './memory/auto-dream.js';
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
      cacheControl?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
      /** Native reasoning effort, forwarded to providers that support it. */
      reasoning?: { effort?: 'low' | 'medium' | 'high'; maxTokens?: number };
    },
  ): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      // Optional prompt-cache token counts, populated by providers that
      // support caching (Anthropic, OpenAI). Mock providers may omit.
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
  }>;
  // Optional pricing surface — concrete providers from
  // `@chimera/providers` implement these so the orchestrator can
  // compute provider-truthful cost (including prompt-cache rates).
  // Mock/test providers may omit them; `estimateCost` falls back to
  // static rates when they are absent.
  getCost?: (tokens: { input: number; output: number }) => number;
  getPricing?: () => {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  };
}

export interface ToolExecutorInterface {
  execute(
    toolName: string,
    params: Record<string, unknown>,
    context: {
      workspaceRoot: string;
      sessionId: string;
      eventStream: EventStream;
      skillPaths?: string[];
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

/**
 * Default prompt-cache directive used for every LLM call dispatched by
 * the orchestrator. The system-prompt prefix is identical across calls
 * for a given role, so attaching a 5-minute ephemeral cache breakpoint
 * maximizes cache hit rate without leaking the prompt to long-lived
 * caches.
 */
const DEFAULT_CACHE_CONTROL = { type: 'ephemeral' as const, ttl: '5m' as const };

// P0.6 — Tool output truncation caps. Whichever limit is hit first wins.
const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;
const TOOL_OUTPUT_MAX_LINES = 200;
const TOOL_OUTPUT_TRUNCATION_MARKER = '\n\n[... truncated, see event log for full output ...]';

/**
 * Hard cap on a single execute() invocation. Defaults to 5 minutes. The
 * CHIMERA_EXECUTE_TIMEOUT_MS env var overrides it so long, unattended
 * multi-agent runs (swarm/hive with slow free models) are not aborted by a
 * fixed wall-clock guard. Interactive use leaves it at the default.
 */
const EXECUTE_TIMEOUT_MS = Number(process.env.CHIMERA_EXECUTE_TIMEOUT_MS ?? 60_000 * 5);

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
  private contextEngine: ContextEngine | null = null;
  private budgetEnforcer: BudgetEnforcer | null = null;
  private rateLimiter: RateLimiter | null = null;
  private auditLog: AuditLog;
  private relayRacing: RelayRacing;
  private handoffProtocol: HandoffProtocol;
  private linter: BiomeLinter;
  private _workspaceRoot: string;
  private toolRelay: ToolContextRelay;
  private workflowExecutor: { execute(script: string): Promise<any> } | null = null;
  private _sessionId: string = `session-${Date.now()}`;
  private _writerMessages: Array<{ role: string; content: string }> = [];
  private _registry: ModelRegistry | null = null;
  private autoExtract: AutoExtractService | null = null;
  private recallService: RecallService | null = null;
  private autoDream: AutoDreamService | null = null;
  private _extractionCursor: number = 0;
  public toolCallHistory: Array<{ toolName: string; args: Record<string, unknown>; result: any }> = [];
  private _lastComplexity: { overall: number; dimensions: Record<string, number> } | null = null;

  constructor(
    eventStream?: EventStream,
    tools?: { registry: ToolRegistryInterface; executor: ToolExecutorInterface },
    workspaceRoot?: string,
    memory?: LongTermMemory,
    options?: {
      contextEngine?: ContextEngine;
      budgetEnforcer?: BudgetEnforcer;
      rateLimiter?: RateLimiter;
      auditLog?: AuditLog;
      registry?: ModelRegistry;
      memoryPersistence?: MemoryPersistence;
      autoExtract?: AutoExtractService;
      recallService?: RecallService;
      autoDream?: AutoDreamService;
    },
  ) {
    this.eventStream = eventStream ?? new EventStream();
    this.costTracker = new CostTracker(this.eventStream);
    this.taskRouter = new TaskRouter(this.eventStream);
    this.agentMesh = new AgentMesh(this.eventStream);
    this.synthesizer = new ResponseSynthesizer(this.eventStream);
    this._workspaceRoot = workspaceRoot ?? process.cwd();
    this.memory = options?.memoryPersistence?.getMemory() ?? memory ?? null;
    this.contextEngine = options?.contextEngine ?? null;
    this.budgetEnforcer = options?.budgetEnforcer ?? null;
    this.rateLimiter = options?.rateLimiter ?? null;
    this.auditLog = options?.auditLog ?? new AuditLog();
    this.relayRacing = new RelayRacing({ defaultContextWindow: 200_000 });
    this.toolRelay = new ToolContextRelay({ boxThreshold: 2000 });
    this.handoffProtocol = new HandoffProtocol();
    this.linter = new BiomeLinter({ configPath: this._workspaceRoot });
    this._registry = options?.registry ?? null;
    this.autoExtract = options?.autoExtract ?? null;
    this.recallService = options?.recallService ?? null;
    this.autoDream = options?.autoDream ?? null;
    if (tools) {
      this.toolRegistry = tools.registry;
      this.toolExecutor = tools.executor;
    }
  }

  setWorkflowExecutor(executor: { execute(script: string): Promise<any> }) {
    this.workflowExecutor = executor;
  }

  async executeWorkflow(
    task: string,
    providers: { writer: LLMProvider },
  ): Promise<any> {
    if (!this.workflowExecutor) throw new Error('Workflow executor not configured');
    
    // 1. Generate workflow script
    const workflowPrompt = buildWorkflowGeneratorPrompt(task);
    const result = await providers.writer.complete(workflowPrompt, { temperature: 0.1 });
    const script = result.content.match(/```javascript\n([\s\S]*?)```/)?.[1] ?? '';
    
    // 2. Execute
    this.eventStream.append({ type: 'workflow_started', task });
    const output = await this.workflowExecutor.execute(script);
    this.eventStream.append({ type: 'workflow_completed', task, output });
    
    return output;
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

  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  exportState(sessionId: string, task: string, mode: Mode): any {
    const events = [...this.eventStream.getAll()];
    return {
      sessionId,
      timestamp: new Date().toISOString(),
      task,
      mode,
      messages: [...this._writerMessages],
      toolCallHistory: this.toolCallHistory.slice(-100),
      events,
      costSpend: Object.fromEntries(
        [...(this.costTracker as any).spend.entries()] as [string, number][],
      ),
      metadata: {
        agentCount: events.filter((e) => (e as any).type === 'agent_spawned').length,
        turnCount: events.filter((e) => (e as any).type === 'draft_proposed').length,
        status: this.state.status === 'error' ? 'failed' : this.state.status === 'complete' ? 'completed' : 'active',
        auditLogSize: this.auditLog.size(),
        lastComplexity: this._lastComplexity,
      },
    };
  }

  async restoreState(checkpoint: any): Promise<void> {
    if (checkpoint.messages && Array.isArray(checkpoint.messages)) {
      this._writerMessages = [...checkpoint.messages];
    }
    if (checkpoint.toolCallHistory && Array.isArray(checkpoint.toolCallHistory)) {
      this.toolCallHistory = [...checkpoint.toolCallHistory];
    }
    if (checkpoint.metadata?.lastComplexity) {
      this._lastComplexity = checkpoint.metadata.lastComplexity;
    }
    if (checkpoint.events && Array.isArray(checkpoint.events)) {
      for (const event of checkpoint.events) {
        this.eventStream.append(event);
      }
    }
    if (checkpoint.metadata?.status === 'completed') {
      this.transition({ status: 'complete', result: checkpoint.task ?? '', cost: 0 });
    } else if (checkpoint.metadata?.status === 'failed') {
      this.transition({ status: 'error', error: 'restored from checkpoint' });
    } else {
      this.transition({ status: 'idle' });
    }
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
    preset?: DeliberationMode;
    maxRetries?: number;
    costCap?: number;
    conversationHistory?: Array<{ role: string; content: string }>;
  }): Promise<OrchestratorResult> {
    const { task, mode, providers, preset, costCap = 10, conversationHistory } = params;
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

    // Validate mode+preset combination (skip validation for 'auto' preset)
    const resolvedPreset = preset ?? this.mapModeToDeliberationMode(mode);
    if (preset && preset !== 'auto') {
      const allowed = VALID_MODE_PRESET_COMBOS[mode];
      if (allowed && !allowed.includes(preset)) {
        this.eventStream.append({
          type: 'mode_preset_warning',
          mode,
          preset,
          resolvedPreset,
          reason: `Preset "${preset}" is not optimal for mode "${mode}". Allowed: [${allowed.join(', ')}]. Using "${resolvedPreset}" instead.`,
        });
        // Downgrade to the mode's default preset
        params.preset = this.mapModeToDeliberationMode(mode);
      }
    }

    try {
      this.eventStream.append({ type: 'user_request', text: task, mode });

      if (this.autoDream) {
        this.autoDream.shouldDream().then((should) => {
          if (should) {
            this.autoDream!.dream().catch(() => {});
          }
        }).catch(() => {});
      }

      const injectionCheck = checkUserInput(task);
      if (!injectionCheck.safe && injectionCheck.confidence > 0.85) {
        this.logSecurityEvent('prompt_injection_detected', injectionCheck.confidence, injectionCheck.flags, { type: 'injection', decision: 'block', payload: task });
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

      let memoryContext = '';
      const instructions = discoverInstructions(this._workspaceRoot);
      const instructionContext = buildInstructionContext(instructions);
      if (instructionContext) {
        memoryContext += instructionContext + '\n\n---\n\n';
      }

      // Auto-detect project metadata when no instructions exist
      if (!memoryContext) {
        const projectContext = detectProjectContext(this._workspaceRoot);
        if (projectContext) {
          memoryContext = `[Project metadata — auto-detected]\n${projectContext}\n\n---\n\n`;
        }
      }

      if (this.contextEngine) {
        try {
          await this.contextEngine.indexRepo();
          const contextPack = await this.contextEngine.buildContextPack({
            task,
            maxTokens: 16000,
          });
          if (contextPack.files.length > 0) {
            memoryContext = contextPack.files
              .map((f: { path: string; content: string; tokens: number; reason: string }) => `[${f.path}] (${f.reason}, ${f.tokens} tokens)\n${f.content.slice(0, 500)}`)
              .join('\n---\n');
            this.eventStream.append({
              type: 'context_pack_created',
              files: contextPack.files.map((f: { path: string }) => f.path),
              tokenEstimate: contextPack.totalTokens,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.eventStream?.append({
            type: 'error',
            message: `Failed to build context pack: ${msg}`,
          });
        }
      } else if (this.recallService) {
        try {
          const recalled = await this.recallService.recall({ query: task, sessionId: this._sessionId });
          if (recalled) {
            memoryContext = recalled;
            this.eventStream.append({
              type: 'context_pack_created',
              files: [],
              tokenEstimate: Math.ceil(recalled.length / 4),
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.eventStream?.append({
            type: 'error',
            message: `Failed to recall memory: ${msg}`,
          });
        }
      } else if (this.memory) {
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.eventStream?.append({
            type: 'error',
            message: `Failed to load memory context: ${msg}`,
          });
        }
      }

      this.transition({ status: 'classifying', task });
      const complexity = await this.taskRouter.classifyTask(task);
      this._lastComplexity = complexity;

      let resolvedMode: Mode = mode;
      if (mode === 'auto') {
        resolvedMode = this.taskRouter.suggestMode(task, complexity);
        this.eventStream.append({
          type: 'mode_suggested',
          requested: 'auto' as Mode,
          suggested: resolvedMode,
          complexity: complexity.overall,
        } as any);
      }

      // Telemetry: track mode+preset combination for optimization
      const resolvedPresetForTelemetry = preset ?? this.mapModeToDeliberationMode(resolvedMode, complexity);
      this.eventStream.append({
        type: 'mode_preset_resolved',
        mode: resolvedMode,
        preset: resolvedPresetForTelemetry,
        complexity: complexity.overall,
        task,
        timestamp: Date.now(),
      });

      // --- Conversational fast path: bypass full pipeline for simple questions ---
      if (TaskRouter.isConversationalTask(task)) {
        return this.executeConversational(task, providers, costCap, memoryContext, conversationHistory, executeSignal);
      }

      // --- Delegate to DeliberationEngine (primary path) ---
      if (this._registry) {
        try {
          const delibResult = await this.executeWithDeliberation(
            task,
            resolvedMode,
            providers,
            costCap,
            preset,
            complexity,
            memoryContext,
            conversationHistory,
          );
          return this.deliberationToOrchestratorResult(
            delibResult,
            task,
            resolvedMode,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.eventStream.append({
            type: 'error',
            message: `DeliberationEngine failed, falling back to inline flow: ${msg}`,
          });
        }
      }

      // --- Inline fallback (backward-compatible) ---
      this.transition({ status: 'planning', task, complexity });
      const needsVerification = this.shouldVerify(resolvedMode, complexity, task);

      const writerId = nextAgentId();
      this.transition({ status: 'drafting', task, agentId: writerId });
      this.agentMesh.registerAgent(this.buildAgentConfig(writerId, 'writer', costCap));
      // Tier-aware runtime adaptation (Stream A). The writer model id is not
      // carried on LLMProvider, so we read it from the registry (first
      // available model is the configured writer). Unknown ids fall back to
      // 'mid' in inferCapabilities → full tools + full context. Only 'cheap'
      // models are trimmed, so frontier/mid behavior is byte-identical.
      const writerModelId = this._registry?.getAll?.()[0]?.id ?? '';
      const writerTier = writerModelId ? inferCapabilities(writerModelId).tier : 'mid';
      const contextWindow = contextBudgetForTier(writerTier).maxContextTokens;
      this.relayRacing.registerAgent(writerId, contextWindow);

      const allowedTools = coreToolsForTier(writerTier);
      const toolDefs = this.buildToolDefinitions(allowedTools);
      const writerMessages = this.buildWriterPrompt(task, resolvedMode, conversationHistory, memoryContext, writerTier);

      const budgetCheck = this.checkBudget(8192);
      if (budgetCheck && budgetCheck.action === 'stop') {
        this.eventStream.append({
          type: 'cost_alert',
          currentCost: budgetCheck.currentCost,
          budget: budgetCheck.budget,
          percentage: budgetCheck.percentage,
          action: 'stop',
        });
        return this.finalize('blocked', outputs, totalCost, task, resolvedMode);
      }

      await this.enforceRateLimit(8192);

      let draftResult = await providers.writer.complete(writerMessages, {
        temperature: 0.7,
        maxTokens: 4096,
        // json_object is mutually exclusive with tool_calls: only force it when
        // no tools are offered, otherwise the model can't emit tool calls.
        ...(toolDefs.length > 0 ? {} : { responseFormat: 'json_object' }),
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        cacheControl: DEFAULT_CACHE_CONTROL,
        signal: executeSignal,
      });

      let draftCost = this.estimateCost(draftResult.usage, providers.writer);
      totalCost += draftCost;
      this.costTracker.recordSpend('writer', draftCost);
      this.logLLMCall('writer', draftResult.usage?.inputTokens ?? 0, draftResult.usage?.outputTokens ?? 0, draftCost, { role: 'writer' });

      this.toolCallHistory = [];
      let iterations = 0;
      this._writerMessages = [...writerMessages];
      while (draftResult.toolCalls && draftResult.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const toolResults = await this.executeToolCalls(draftResult.toolCalls, { sessionId: writerId }, executeSignal);
        this.toolCallHistory.push(...toolResults.map(tr => ({ toolName: tr.toolName, args: tr.args, result: tr.result.result })));

        for (const tr of toolResults) {
          this.logToolCall(tr.toolName, JSON.stringify(tr.args).slice(0, 100), tr.result.result.duration * 0.000001, { duration: tr.result.result.duration });
        }

        const toolMessages = this.buildToolResultMessages(writerMessages, draftResult, toolResults);

        const inputTokens = (draftResult.usage?.inputTokens ?? 0) + (draftResult.usage?.outputTokens ?? 0);
        const threshold = this.relayRacing.trackTokens(writerId, inputTokens);

        let maskedMessages = this.relayRacing.maskObservations(toolMessages);

        if (threshold.recommendedAction === 'handoff' || threshold.recommendedAction === 'emergency_handoff') {
          const compacted = runCompactionPipeline(this._writerMessages);
          this._writerMessages = compacted.messages;

          const events = [...this.eventStream.getAll()];
          const handoffDoc = this.handoffProtocol.createCompactingHandoff(events, {
            session: this._sessionId,
            agent: writerId,
            contextFill: threshold.fillPercent,
          });
          const validation = this.handoffProtocol.validateHandoff(handoffDoc);

          this.eventStream.append({
            type: 'handoff_triggered',
            fromAgent: writerId,
            toAgent: 'next-writer',
            reason: threshold.tier === 'emergency' ? 'context_threshold' : 'task_boundary',
            format: 'compact',
            tokenCount: compacted.totalTokensSaved,
            claimIds: handoffDoc.meta.claims,
          } as any);

          this.eventStream.append({
            type: 'handoff_validated',
            accepted: validation.dataComplete && validation.referencesGrounded && validation.claimsVerified && validation.capabilityMatch,
            checklist: validation,
            clarifications: [],
          } as any);

          if (validation.dataComplete) {
            const serialized = this.handoffProtocol.serializeHandoff(handoffDoc);
            writerMessages.push({ role: 'system', content: `## Context Handoff\n${serialized}` });
          }
        }

        // #5 — Proactive compaction: even if relay racing didn't trigger a
        // handoff, compact the message history when estimated tokens exceed
        // 80% of the context window. This prevents silent context degradation
        // on long tool loops where relay racing thresholds aren't hit.
        const estimatedTokens = this._writerMessages.reduce((sum, m) => sum + m.content.length, 0) / 4;
        const CONTEXT_WINDOW = 200_000;
        const COMPACTION_THRESHOLD = 0.80;
        if (estimatedTokens > CONTEXT_WINDOW * COMPACTION_THRESHOLD) {
          const compacted = runCompactionPipeline(this._writerMessages);
          const saved = compacted.totalTokensSaved;
          if (saved > 0) {
            this._writerMessages = compacted.messages;
            this.eventStream.append({
              type: 'compaction_triggered',
              reason: 'proactive_token_threshold',
              estimatedTokensBefore: Math.round(estimatedTokens),
              tokensSaved: saved,
              stages: compacted.stages.map((s) => ({ stage: s.stage, saved: s.tokensSaved })),
            } as any);
          }
        }

        const iterBudget = this.checkBudget(8192);
        if (iterBudget && iterBudget.action === 'stop') break;

        await this.enforceRateLimit(8192);

        draftResult = await providers.writer.complete(maskedMessages, {
          temperature: 0.7,
          maxTokens: 4096,
          ...(toolDefs.length > 0 ? {} : { responseFormat: 'json_object' }),
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          cacheControl: DEFAULT_CACHE_CONTROL,
          signal: executeSignal,
        });

        const iterCost = this.estimateCost(draftResult.usage, providers.writer);
        draftCost += iterCost;
        totalCost += iterCost;
        this.costTracker.recordSpend('writer', iterCost);
        this.logLLMCall('writer', draftResult.usage.inputTokens, draftResult.usage.outputTokens, iterCost, { role: 'writer' });
      }

      const draftParsed = this.parseJSON<StructuredOutput>(draftResult.content);
      const draftContent = sanitizeWriterOutput(draftParsed.response ?? draftResult.content);
      const draftConfidence = draftParsed.confidence ?? 0.5;

      this._writerMessages.push({ role: 'assistant', content: draftContent });

      outputs.push({
        agentId: writerId,
        role: 'writer',
        content: draftContent,
        confidence: draftConfidence,
        provider: 'llm',
        model: 'default',
        tokensUsed: (draftResult.usage?.inputTokens ?? 0) + (draftResult.usage?.outputTokens ?? 0),
      });

      this.eventStream.append({
        type: 'draft_proposed',
        agentId: writerId,
        patchId: `patch-${writerId}`,
        confidence: draftConfidence,
      });

      if (!needsVerification) {
        return this.finalize('done', outputs, totalCost, task, resolvedMode);
      }

      const reviewerId = nextAgentId();
      this.transition({ status: 'verifying', task, draft: draftContent, agentId: reviewerId });
      this.agentMesh.registerAgent(this.buildAgentConfig(reviewerId, 'reviewer', costCap));

      const reviewerBudget = this.checkBudget(8192);
      if (reviewerBudget && reviewerBudget.action === 'stop') {
        return this.finalize('done', outputs, totalCost, task, resolvedMode);
      }

      await this.enforceRateLimit(8192);

      const reviewerMessages = this.buildReviewerPrompt(task, draftContent, resolvedMode, conversationHistory, memoryContext);
      const reviewResult = await providers.reviewer.complete(reviewerMessages, {
        temperature: 0.2,
        maxTokens: 4096,
        responseFormat: 'json_object',
        cacheControl: DEFAULT_CACHE_CONTROL,
        signal: executeSignal,
      });

      const reviewCost = this.estimateCost(reviewResult.usage, providers.reviewer);
      totalCost += reviewCost;
      this.costTracker.recordSpend('reviewer', reviewCost);
      this.logLLMCall('reviewer', reviewResult.usage?.inputTokens ?? 0, reviewResult.usage?.outputTokens ?? 0, reviewCost, { role: 'reviewer' });

      const reviewParsed = this.parseJSON<ReviewVerdict>(reviewResult.content);
      const verdict = reviewParsed.verdict ?? 'PASS';
      const findings = reviewParsed.findings ?? [];

      outputs.push({
        agentId: reviewerId,
        role: 'reviewer',
        content: sanitizeReviewerOutput(reviewResult.content),
        confidence: reviewParsed.confidence ?? 0.5,
        provider: 'llm',
        model: 'default',
        tokensUsed: (reviewResult.usage?.inputTokens ?? 0) + (reviewResult.usage?.outputTokens ?? 0),
        issues: findings,
      });

      this.eventStream.append({
        type: 'verified',
        agentId: reviewerId,
        verdict: verdict === 'PASS' ? 'pass' : verdict === 'FAIL' ? 'fail' : 'needs_revision',
        findings: findings.map((f) => ({
          description: f.description,
          severity: f.severity,
          evidence: f.evidence,
        })),
      });

      if (providers.challenger && verdict !== 'PASS') {
        const challengerId = nextAgentId();
        this.transition({
          status: 'challenging',
          task,
          draft: draftContent,
          review: reviewResult.content,
          agentId: challengerId,
        });
        this.agentMesh.registerAgent(this.buildAgentConfig(challengerId, 'challenger', costCap));

        const challengerBudget = this.checkBudget(8192);
        if (challengerBudget && challengerBudget.action === 'stop') {
          return this.finalize('needs_user', outputs, totalCost, task, resolvedMode);
        }

        await this.enforceRateLimit(8192);

        const challengerMessages = this.buildChallengerPrompt(task, draftContent, reviewResult.content, conversationHistory, memoryContext);
        const challengeResult = await providers.challenger.complete(challengerMessages, {
          temperature: 0.5,
          maxTokens: 4096,
          responseFormat: 'json_object',
          cacheControl: DEFAULT_CACHE_CONTROL,
          signal: executeSignal,
        });

        const challengeCost = this.estimateCost(challengeResult.usage, providers.challenger);
        totalCost += challengeCost;
        this.costTracker.recordSpend('challenger', challengeCost);
        this.logLLMCall('challenger', challengeResult.usage?.inputTokens ?? 0, challengeResult.usage?.outputTokens ?? 0, challengeCost, { role: 'challenger' });

        const challengeParsed = this.parseJSON<StructuredOutput>(challengeResult.content);

        outputs.push({
          agentId: challengerId,
          role: 'challenger',
          content: challengeParsed.response ?? challengeResult.content,
          confidence: challengeParsed.confidence ?? 0.5,
          provider: 'llm',
          model: 'default',
          tokensUsed: (challengeResult.usage?.inputTokens ?? 0) + (challengeResult.usage?.outputTokens ?? 0),
        });

        this.eventStream.append({
          type: 'challenged',
          agentId: challengerId,
          challenges: challengeParsed.issues ?? [],
          alternatives: challengeParsed.filesChanged ?? [],
        });

        if (verdict === 'FAIL') {
          return this.finalize('needs_user', outputs, totalCost, task, resolvedMode);
        }
      }

      return this.finalize('done', outputs, totalCost, task, resolvedMode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const safeMessage = message && message.length > 0 ? message : 'unknown orchestration error';
      // If the task wanted files and at least one valid source file already
      // landed on disk, the deliverable exists — report needs_user (review
      // needed) instead of a bare error, so users/matrix aren't shown a
      // confusing failure for work that actually completed.
      const wantsFiles = /\b(create|scaffold|write|generate|build|implement|make|port|add)\b/i.test(task) ||
        /\.(rs|ts|js|jsx|tsx|py|toml|json|md|ya?ml|go|java|cpp|c|rb|php|txt|html|css|sh)$/i.test(task);
      const fileLanded = wantsFiles && countSourceFiles(this._workspaceRoot) > 0;
      if (fileLanded) {
        const note = `File(s) written but final synthesis/aggregation failed (${safeMessage}). Needs user review.`;
        this.transition({ status: 'needs_user', error: note } as never);
        this.eventStream.append({
          type: 'final_response',
          status: 'needs_user',
          cost: totalCost,
          agentCount: outputs.length,
          output: note,
        });
        return { status: 'needs_user', output: note, cost: totalCost, agentCount: outputs.length, events: [...this.eventStream.getAll()] };
      }
      this.transition({ status: 'error', error: safeMessage });
      this.eventStream.append({
        type: 'final_response',
        status: 'blocked',
        cost: totalCost,
        agentCount: outputs.length,
        output: `Error: ${safeMessage}`,
      });
      return { status: 'error', output: `Error: ${safeMessage}`, cost: totalCost, agentCount: outputs.length, events: [...this.eventStream.getAll()] };
    } finally {
      // Ensure we never leak a pending timeout signal. The AbortController
      // is single-use and any future readers of executeSignal would see
      // the already-aborted state.
      ac.abort('execute-finished');
    }
  }

  /**
   * Conversational fast path: single LLM call with plain text output.
   * Bypasses the full multi-agent pipeline (no reviewer, no challenger,
   * no JSON schema) for simple questions like "who are you?", "what can you do?",
   * "where do you need tuning?", etc.
   */
  private async executeConversational(
    task: string,
    providers: { writer: LLMProvider; reviewer: LLMProvider; challenger?: LLMProvider },
    costCap: number,
    context: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const agentId = nextAgentId();

    this.transition({ status: 'drafting', task, agentId });

    const messages = buildConversationalMessages(task, context, this._workspaceRoot, conversationHistory);

    try {
      const result = await providers.writer.complete(messages, {
        temperature: 0.7,
        maxTokens: 2048,
        responseFormat: 'text',
        signal,
      });

      const cost = this.estimateCost(result.usage, providers.writer);
      this.costTracker.recordSpend('writer', cost);

      const output = result.content.trim();
      const duration = Date.now() - startTime;

      this.eventStream.append({
        type: 'final_response',
        status: 'done',
        cost,
        agentCount: 1,
        output,
      });

      this.transition({ status: 'complete', result: task, cost });

      return {
        status: 'done',
        output,
        cost,
        agentCount: 1,
        events: [...this.eventStream.getAll()],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.transition({ status: 'error', error: message });
      this.eventStream.append({
        type: 'final_response',
        status: 'blocked',
        cost: 0,
        agentCount: 0,
        output: `Error: ${message}`,
      });
      return {
        status: 'error',
        output: `Error: ${message}`,
        cost: 0,
        agentCount: 0,
        events: [...this.eventStream.getAll()],
      };
    }
  }

  async executeWithDeliberation(
    task: string,
    mode: Mode,
    providers: { writer: LLMProvider; reviewer: LLMProvider; challenger?: LLMProvider },
    costCap: number = 10,
    preset?: DeliberationMode,
    complexity?: ComplexityScore,
    context?: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ): Promise<DeliberationResult> {
    if (!this._registry) {
      throw new Error('ModelRegistry required for deliberation — pass options.registry');
    }

    const engine = new DeliberationEngine({
      eventStream: this.eventStream,
      registry: this._registry,
      costTracker: this.costTracker,
      providerFactory: this.buildProviderFactory(providers),
      // CRITICAL: workspaceRoot must be passed so deliberation executors
      // actually execute tool calls (write_file/shell) against the repo.
      // Without it the `&& this.workspaceRoot` guard silently no-ops every tool.
      workspaceRoot: this._workspaceRoot,
      toolExecutor: this.toolExecutor,
      toolRegistry: this.toolRegistry,
      // Provider IDs the factory understands (writer/reviewer/challenger).
      // Required by the swarm preset (runSwarm) and auto preset to build the
      // provider pool. Without it, swarm silently degrades to "no providers".
      availableProviders: ['writer', 'reviewer', 'challenger'],
    });

    const config = this.buildDeliberationConfig(task, mode, providers, costCap, preset, complexity, context, conversationHistory);
    return engine.run(config);
  }

  private buildProviderFactory(
    providers: { writer: LLMProvider; reviewer: LLMProvider; challenger?: LLMProvider },
  ): (modelId: string) => LLMProvider {
    return (modelId: string) => {
      switch (modelId) {
        case 'reviewer':
          return providers.reviewer;
        case 'challenger':
          return providers.challenger ?? providers.writer;
        default:
          return providers.writer;
      }
    };
  }

  private mapModeToDeliberationMode(mode: Mode, complexity?: ComplexityScore): DeliberationMode {
    switch (mode) {
      case 'code':
      case 'debug': {
        // Complexity-gated selection: trivial → solo, medium → duo, complex → trio, very complex → fusion
        if (!complexity) return 'trio'; // fallback when no complexity available
        if (complexity.overall < 0.3) return 'solo';  // trivial: single model
        if (complexity.overall < 0.6) return 'duo';   // medium: two models
        if (complexity.overall >= 0.8) return 'fusion'; // high-stakes: multi-model deliberation
        return 'trio';                                 // complex: full pipeline
      }
      case 'review':
        return 'duo';
      case 'ask':
      case 'plan':
      default:
        return 'solo';
    }
  }

  private buildDeliberationConfig(
    task: string,
    mode: Mode,
    providers: { writer: LLMProvider; reviewer: LLMProvider; challenger?: LLMProvider },
    costCap: number,
    preset?: DeliberationMode,
    complexity?: ComplexityScore,
    context?: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ): DeliberationConfig {
    const delibMode = preset ?? this.mapModeToDeliberationMode(mode, complexity);

    // Append conversation history to context so the model has full conversational awareness
    let fullContext = context ?? '';
    if (conversationHistory && conversationHistory.length > 0) {
      const MAX_HISTORY_TURNS = 10;
      const MAX_HISTORY_CHARS = 32000;
      let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
      let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
      while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
        const removed = historyMessages.shift()!;
        totalChars -= removed.content.length;
      }

      const historyBlock = [
        '',
        '--- PREVIOUS CONVERSATION CONTEXT ---',
        'Use this context to understand what the user has been discussing.',
        'Do NOT repeat information already provided. Build on previous answers.',
        ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
        '--- END PREVIOUS CONVERSATION ---',
        '',
      ].join('\n');

      fullContext = fullContext ? `${fullContext}\n${historyBlock}` : historyBlock;
    }

    const base = { task, context: fullContext, budgetUsd: costCap, temperature: 0.7, maxCompletionTokens: 4096 };

    const getModelIds = (): string[] =>
      this._registry
        ? this._registry
            .getAll()
            .filter((m: import('@chimera/providers').ModelEntry) => !m.deprecated)
            .map((m: import('@chimera/providers').ModelEntry) => m.id)
        : ['default'];

    // Override to fusion when task explicitly requests multi-model deliberation
    if (delibMode !== 'fusion' && !preset) {
      const lower = task.toLowerCase();
      const fusionKeywords = ['compare', 'debate', 'perspectives', 'alternatives', 'tradeoffs', 'consensus'];
      if (fusionKeywords.some((k) => lower.includes(k))) {
        return { ...base, mode: 'fusion', analysisModels: getModelIds().slice(0, 3), judgeModel: getModelIds().slice(-1)[0] ?? 'default' };
      }
    }

    switch (delibMode) {
      case 'solo':
        return { ...base, mode: 'solo', model: getModelIds()[0] ?? 'default' };
      case 'duo': {
        const ids = getModelIds();
        return { ...base, mode: 'duo', modelA: ids[0] ?? 'default', modelB: ids[1] ?? ids[0] ?? 'default' };
      }
      case 'trio': {
        const ids = getModelIds();
        return {
          ...base,
          mode: 'trio',
          writer: ids[0] ?? 'default',
          reviewer: ids[1] ?? ids[0] ?? 'default',
          ...(providers.challenger ? { challenger: ids[2] ?? ids[0] ?? 'default' } : {}),
        };
      }
      case 'fusion': {
        const modelIds = this._registry
          ? this._registry.getAll()
              .filter((m: import('@chimera/providers').ModelEntry) => !m.deprecated)
              .map((m: import('@chimera/providers').ModelEntry) => m.id)
          : ['default'];
        const panel = modelIds.slice(0, 3);
        const judge = modelIds[modelIds.length - 1] ?? 'default';
        return { ...base, mode: 'fusion', analysisModels: panel, judgeModel: judge };
      }
      case 'hive': {
        // Build model pool from registry for capability-based routing
        const modelIds = this._registry
          ? this._registry.getAll().filter((m: import('@chimera/providers').ModelEntry) => !m.deprecated).map((m: import('@chimera/providers').ModelEntry) => m.id)
          : ['default'];
        const modelPool = buildPool(modelIds, { preferFrontierForJudge: true });
        return {
          ...base,
          mode: 'hive',
          models: modelIds.slice(0, 6), // Limit to 6 models for practical concurrency
          modelPool,
        };
      }
      case 'auto':
        return { ...base, mode: 'auto' };
      case 'merge':
        return { ...base, mode: 'merge', subTaskResults: [], mergeModel: 'default' };
      case 'swarm':
        return {
          ...base,
          mode: 'swarm',
          maxAgents: 50,
          maxConcurrency: 10,
          clusterSize: 15,
          staggerDelayMs: 50,
          // Match the per-agent timeout to the orchestrator's execute timeout
          // (env-overridable) so a long unattended swarm run is not killed at
          // the agent level before the orchestrator's own guard fires.
          taskTimeoutMs: EXECUTE_TIMEOUT_MS,
        };
    }
  }

  private deliberationToOrchestratorResult(
    delib: DeliberationResult,
    task: string,
    mode: Mode,
  ): OrchestratorResult {
    // ── Status resolution ───────────────────────────────────────────
    // `delib.degraded` is the ONLY source of an `error` status. But an
    // `error` MUST always carry a human-readable message (never a bare
    // empty status), and if a valid file already landed on disk, a
    // post-write synthesis/aggregation failure is DOWNGRADED to
    // `needs_user` instead of a cryptic bare `error`. This keeps the
    // trust guarantee: we never report `done` for a broken/missing file,
    // but we also never silently lose a deliverable that did land.
    const fileLanded = (mode === 'code' || mode === 'debug') && this.fileTaskHasLandedFile(task);
    // Only file-producing modes (code/debug) escalate a degraded no-file
    // result to a hard `error`: that is the anti-false-success guarantee — a
    // missing app must be flagged. For conversational/analysis modes
    // (ask/plan/review/oal/auto), a degraded result (e.g. a free model
    // returning empty content on one call) is a weak/empty answer the user
    // should review, not a harness crash, so it maps to `needs_user`.
    const expectsFile = mode === 'code' || mode === 'debug';

    let status: OrchestratorResult['status'];
    if (delib.degraded) {
      status = fileLanded ? 'needs_user' : (expectsFile ? 'error' : 'needs_user');
    } else if (delib.analysis.confidence < 0.3) {
      // A low confidence here usually means the executor's file-write counter
      // never ticked (e.g. the fix landed via the prose-to-action fallback or
      // an edit_file that the counter missed). If the task's expected output
      // file actually landed on disk, the deliverable is real — report `done`
      // rather than a false `needs_user`. Otherwise escalate for human review.
      status = fileLanded ? 'done' : 'needs_user';
    } else {
      status = 'done';
    }

    // (a) Never emit a bare `error`: always attach a readable message.
    let output = delib.output ?? '';
    if (status === 'error' && !output.trim()) {
      output = delib.degradationReason
        ? `[chimera] ${delib.degradationReason}`
        : '[chimera] deliberation degraded but produced no detail.';
    }
    // (b) For a downgraded degraded→needs_user, surface the reason so the
    // matrix (and humans) know a file landed but synthesis/review failed.
    if (status === 'needs_user' && delib.degraded) {
      const reason = delib.degradationReason ?? 'deliberation degraded';
      const tag = fileLanded
        ? 'file written but synthesis/review failed; review needed'
        : reason;
      output = `${output}\n\n[chimera] ${tag}.`;
    }

    const agentCountForMode = (m: DeliberationResult['mode']): number => {
      switch (m) {
        case 'solo': return 1;
        case 'duo': return 2;
        case 'trio': return 3;
        case 'merge': return 2;
        case 'fusion': return 4; // panel (up to 3) + judge
        case 'hive': return 6;
        case 'swarm': return 50;
        case 'auto': return delib.autoSelection ? agentCountForMode(delib.autoSelection.selectedPreset) : 1;
      }
    };
    const agentCount = agentCountForMode(delib.mode);

    // ── File-task completion gate (anti false-success) ───────────────
    // For code/debug tasks the whole point is a file on disk. Free/small
    // models often NARRATE the code in prose instead of emitting a tool
    // call, or emit a truncated write that the tool layer refuses. Either
    // way, if no write tool actually LANDED (success event), reporting
    // `done` would be a silent false-success. Route those to needs_user so
    // the caller knows no file was produced. This is mode-agnostic: it
    // covers duo/hive/swarm (which have no native tool loop) as well as
    // solo/trio (whose prose-fallback already emits real tool calls).
    if ((mode === 'code' || mode === 'debug') && status === 'done') {
      if (!this.fileTaskHasLandedFile(task)) {
        return {
          status: 'needs_user',
          output: delib.output + '\n\n[chimera] No file was written — the model narrated the result without producing a file. Needs user attention.',
          cost: delib.totalCostUsd,
          agentCount,
          events: [...this.eventStream.getAll()],
        };
      }
    }

    this.transition({ status: 'complete', result: delib.output, cost: delib.totalCostUsd });

    this.eventStream.append({
      type: 'deliberation_result',
      mode: delib.mode,
      output: delib.output,
      analysis: delib.analysis,
    });

    this.eventStream.append({
      type: 'final_response',
      status: status === 'error' ? 'blocked' : status,
      cost: delib.totalCostUsd,
      agentCount,
      output,
    });

    if (this.memory && status === 'done') {
      this.memory.write({
        content: `Task: ${task}\nResult: ${delib.output.slice(0, 500)}`,
        topic: mode,
        importance: 0.6,
        source: 'user',
        tags: [mode, 'task-result'],
      }).catch((err) => {
        const message = `Failed to persist task result to memory: ${err instanceof Error ? err.message : String(err)}`;
        // Non-fatal: memory loss must not crash the task. Surface a visible
        // warning in addition to the event stream so the failure isn't silent.
        console.warn(`[chimera] ${message}`);
        this.eventStream?.append({
          type: 'error',
          message,
        });
      });
    }

    if (this.autoExtract && task) {
      this.autoExtract.extract({
        messages: this._writerMessages,
        sessionId: this._sessionId,
        cursor: this._extractionCursor,
      }).then((newCursor) => {
        this._extractionCursor = newCursor;
      }).catch(() => {});
    }

    return {
      status,
      output,
      cost: delib.totalCostUsd,
      agentCount,
      events: [...this.eventStream.getAll()],
    };
  }

  /**
   * Did a code/debug task actually land a file on disk?
   * True only if the session emitted a successful `write_file`/`edit_file`
   * tool result (exitCode 0). A write that the truncation guard refused
   * leaves no success event, so it correctly counts as "not landed".
   */
  private fileTaskHasLandedFile(task: string): boolean {
    const events = this.eventStream.getAll();
    for (const ev of events) {
      const t = (ev as { type?: string })?.type;
      if (t === 'tool_call_result') {
        const result = (ev as { result?: { tool?: string; exitCode?: number } }).result;
        if ((result?.tool === 'write_file' || result?.tool === 'edit_file') && result?.exitCode === 0) {
          return true;
        }
      }
    }
    // Ground-truth fallback: a success event is not the only way a file
    // lands. The prose-to-action fallback (executeProseActions) and
    // edit_file flows write the file directly, and their success event may
    // not carry the exact (tool/exitCode) shape this check reads. If the
    // task's expected output file actually exists on disk, the deliverable
    // landed — trust disk over event bookkeeping so a correctly written file
    // is not mis-escalated to needs_user.
    const rel = expectedPathFromTask(task);
    if (rel) {
      const abs = path.isAbsolute(rel) ? rel : path.resolve(this._workspaceRoot, rel);
      if (existsSync(abs)) return true;
    }
    return false;
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

    // Map internal synthesis to external deliberation analysis shape
    const analysis = {
      thought: '',
      consensus: outputs.length > 1 ? [synthesis.unifiedResponse.split('\n')[0]] : [],
      conflicts: synthesis.conflicts.map(c => `${c.type}: ${c.description}`),
      uniqueInsights: synthesis.mergedIssues.map(i => i.description),
      blindSpots: [],
      confidence: synthesis.overallConfidence,
    };

    this.eventStream.append({
      type: 'deliberation_result',
      mode: (mode as any) === 'merge' ? 'merge' : (outputs.length > 2 ? 'trio' : (outputs.length > 1 ? 'duo' : 'solo')),
      output: synthesis.unifiedResponse,
      analysis,
    });

    this.eventStream.append({
      type: 'final_response',
      status: resolvedStatus === 'error' ? 'blocked' : resolvedStatus,
      cost: totalCost,
      agentCount: outputs.length,
      output: synthesis.unifiedResponse,
    });

    if (this.memory && resolvedStatus === 'done' && task && mode) {
      this.memory.write({
        content: `Task: ${task}\nResult: ${synthesis.unifiedResponse.slice(0, 500)}`,
        topic: mode,
        importance: 0.6,
        source: 'user',
        tags: [mode, 'task-result'],
      }).catch((err) => {
        const message = `Failed to persist task result to memory: ${err instanceof Error ? err.message : String(err)}`;
        // Memory write is best-effort; non-fatal so it doesn't block the
        // orchestrator, but the failure must be visible rather than silent.
        console.warn(`[chimera] ${message}`);
        this.eventStream?.append({
          type: 'error',
          message,
        });
      });
    }

    if (this.autoExtract && task) {
      this.autoExtract.extract({
        messages: this._writerMessages,
        sessionId: this._sessionId,
        cursor: this._extractionCursor,
      }).then((newCursor) => {
        this._extractionCursor = newCursor;
      }).catch(() => {});
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
   * the cost.
   */
  private async runReviewer(args: {
    reviewer: LLMProvider;
    task: string;
    draft: string;
    mode: Mode;
    reviewerId: string;
    costCap: number;
    signal?: AbortSignal;
    conversationHistory?: Array<{ role: string; content: string }>;
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

    const reviewerMessages = this.buildReviewerPrompt(args.task, args.draft, args.mode, args.conversationHistory);
    const reviewResult = await args.reviewer.complete(reviewerMessages, {
      temperature: 0.2,
      maxTokens: 4096,
      responseFormat: 'json_object',
      signal: args.signal,
    });

    const reviewCost = this.estimateCost(reviewResult.usage, args.reviewer);
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
      reviewTokens: (reviewResult.usage?.inputTokens ?? 0) + (reviewResult.usage?.outputTokens ?? 0),
    };
  }

  /**
   * Run the challenger step: build the prompt, call the provider,
   * parse the structured output, register the agent in the mesh, and
   * record the cost.
   */
  private async runChallenger(args: {
    challenger: LLMProvider;
    task: string;
    draft: string;
    review: string;
    challengerId: string;
    costCap: number;
    signal?: AbortSignal;
    conversationHistory?: Array<{ role: string; content: string }>;
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

    const challengerMessages = this.buildChallengerPrompt(args.task, args.draft, args.review, args.conversationHistory);
    const challengeResult = await args.challenger.complete(challengerMessages, {
      temperature: 0.5,
      maxTokens: 4096,
      responseFormat: 'json_object',
      signal: args.signal,
    });

    const challengeCost = this.estimateCost(challengeResult.usage, args.challenger);
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
   * append the `verified` event.
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
   * append the `challenged` event.
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
   * summary suitable for use as an agent's `content` field.
   */
  private buildReviewerSummary(
    verdict: string,
    findings: Array<{ description: string; severity: 'high' | 'med' | 'low'; evidence: string }>,
    _thought?: string,
  ): string {
    if (verdict === 'PASS') return '';
    if (findings.length === 0) return '';
    const lines = findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.description}`);
    return `Review findings:\n${lines.join('\n')}`;
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
    conversationHistory?: Array<{ role: string; content: string }>;
  }): Promise<{
    qualityGate: QualityGateResult;
    execution: ParallelExecutionResult;
    outputs: AgentOutput[];
  }> {
    const { task, draft, mode, providers, costCap, conversationHistory } = params;
    const startTime = Date.now();
    const outputs: AgentOutput[] = [];

    const reviewerId = nextAgentId();
    const challengerId = nextAgentId();

    this.agentMesh.registerAgent(this.buildAgentConfig(reviewerId, 'reviewer', costCap));
    if (providers.challenger) {
      this.agentMesh.registerAgent(this.buildAgentConfig(challengerId, 'challenger', costCap));
    }

    this.eventStream.append({
      type: 'quality_gate_parallel_started',
      reviewerId,
      challengerId,
      draftPreview: draft.slice(0, 200),
    });

    const reviewerPromise = (async () => {
      const reviewerMessages = this.buildReviewerPrompt(task, draft, mode, conversationHistory);
      const result = await providers.reviewer.complete(reviewerMessages, {
        temperature: 0.2,
        maxTokens: 4096,
        responseFormat: 'json_object',
        cacheControl: DEFAULT_CACHE_CONTROL,
      });

      const cost = this.estimateCost(result.usage);
      this.costTracker.recordSpend('reviewer', cost);

      const parsed = this.parseJSON<ReviewVerdict>(result.content);

      outputs.push({
        agentId: reviewerId,
        role: 'reviewer',
        content: sanitizeReviewerOutput(result.content),
        confidence: parsed.confidence ?? 0.5,
        provider: 'llm',
        model: 'default',
        tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),      });

      this.eventStream.append({
        type: 'verified',
        agentId: reviewerId,
        verdict: parsed.verdict === 'PASS' ? 'pass' : parsed.verdict === 'FAIL' ? 'fail' : 'needs_revision',
        findings: (parsed.findings ?? []).map((f) => ({
          description: f.description,
          severity: f.severity,
          evidence: f.evidence,
        })),
      });

      return {
        verdict: parsed.verdict ?? 'PASS',
        confidence: parsed.confidence ?? 0.5,
        findings: parsed.findings ?? [],
        raw: result.content,
      };
    })();

    const challenger = providers.challenger;
    const challengerPromise = challenger
      ? (async () => {
          const challengerMessages = this.buildChallengerPrompt(task, draft, '', conversationHistory);
          const result = await challenger.complete(challengerMessages, {
            temperature: 0.5,
            maxTokens: 4096,
            responseFormat: 'json_object',
            cacheControl: DEFAULT_CACHE_CONTROL,
          });

      const cost = this.estimateCost(result.usage, challenger);
          this.costTracker.recordSpend('challenger', cost);

          const parsed = this.parseJSON<StructuredOutput>(result.content);

          outputs.push({
            agentId: challengerId,
            role: 'challenger',
            content: parsed.response ?? result.content,
            confidence: parsed.confidence ?? 0.5,
            provider: 'llm',
            model: 'default',
            tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),          });

          this.eventStream.append({
            type: 'challenged',
            agentId: challengerId,
            challenges: parsed.issues ?? [],
            alternatives: parsed.filesChanged ?? [],
          });

          return {
            response: parsed.response ?? result.content,
            confidence: parsed.confidence ?? 0.5,
            issues: parsed.issues ?? [],
            alternatives: parsed.filesChanged ?? [],
            raw: result.content,
          };
        })()
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

  private checkBudget(estimatedTokens: number): BudgetCheckResult | null {
    if (!this.budgetEnforcer) return null;
    return this.budgetEnforcer.check(estimatedTokens * 0.000002, this._sessionId);
  }

  private async enforceRateLimit(estimatedTokens: number): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire(estimatedTokens);
    }
  }

  private logLLMCall(model: string, inputTokens: number, outputTokens: number, cost: number, details?: Record<string, unknown>): void {
    this.auditLog.logLLMCall({
      sessionId: this._sessionId,
      model,
      inputTokens,
      outputTokens,
      tokenCost: cost,
      details: {
        ...details,
        tokens: inputTokens + outputTokens,
      },
    });
  }

  private logToolCall(tool: string, paramsHash: string, cost: number, details?: Record<string, unknown>): void {
    this.auditLog.logToolCall({
      sessionId: this._sessionId,
      tool,
      paramsHash,
      userApproved: true,
      tokenCost: cost,
      details: {
        toolName: tool,
        decision: 'allow',
        ...details,
      },
    });
  }

  private logSecurityEvent(event: string, confidence: number, flags: string[], details?: Record<string, unknown>): void {
    this.auditLog.logSecurityEvent({
      sessionId: this._sessionId,
      event,
      confidence,
      flags,
      details: {
        ...details,
      },
    });
  }

  private shouldVerify(mode: Mode, complexity: ComplexityScore, task?: string): boolean {
    if (task && TaskRouter.isConversationalTask(task)) return false;
    if (mode === 'ask' && complexity.overall < 0.4) return false;
    return true;
  }

  buildWriterPrompt(task: string, mode: Mode, conversationHistory?: Array<{ role: string; content: string }>, context?: string, tier: 'cheap' | 'mid' | 'frontier' | 'reasoning' = 'mid'): Array<{ role: string; content: string }> {
    // Tier-aware prompt compression (Stream C + Stream A). Cheap models get a
    // compact identity + compact role prompt + small-model guidance so they
    // stay coherent; frontier/mid get the full prompt (byte-identical to before).
    const identity = tier === 'cheap' ? COMPACT_CORE_IDENTITY : CHIMERA_CORE_IDENTITY;
    const rolePrompt = tier === 'cheap' ? compactAgentPrompt('writer') : AGENT_PROMPTS.writer.system;
    const smallModelSuffix = tier === 'cheap' ? `\n\n${SMALL_MODEL_GUIDANCE}` : '';
    const messages = buildMessages({ role: 'writer', mode, task, context, workspaceRoot: this._workspaceRoot, cacheControl: DEFAULT_CACHE_CONTROL });
    // Inject the tier-specific identity + role prompt at the front (after the
    // leading system message that buildMessages emits).
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { role: 'system', content: `${identity}\n\n${rolePrompt}${smallModelSuffix}` };
    } else {
      messages.unshift({ role: 'system', content: `${identity}\n\n${rolePrompt}${smallModelSuffix}` });
    }

    const isConversational = TaskRouter.isConversationalTask(task);

    const outputInstructions = isConversational
      ? [
          'Answer the following question directly and naturally.',
          'No structured output needed — just give a clear, helpful answer.',
          'If the user message contains typos, misspellings, or casual shorthand, infer their intent',
          'and answer accordingly. Never respond with "I didn\'t understand" — give your best answer.',
        ].join('\n')
      : [
          'Respond with valid JSON matching this schema:',
          '{"thought": string, "response": string, "confidence": number 0-1, "filesChanged": string[], "issues": string[], "rationale": string}',
          'The "thought" field must contain your comprehensive Chain-of-Thought reasoning.',
          'The "response" field contains your main output — this is what the user sees.',
          'The "confidence" field is how confident you are (0 = guessing, 1 = certain).',
          'The "filesChanged" field lists any files referenced or modified.',
          'The "rationale" field explains why you chose this approach.',
          '',
          'CRITICAL: For conversational questions (e.g., "what can you do?", "who are you?", "how do I use X?"),',
          'answer directly in the "response" field. Do NOT put analysis, meta-reasoning, or internal',
          'assessment of other agents in the response field. The response field is the user-facing answer.',
          'Analysis like "The original writer draft was empty..." or "The reviewer identified..." belongs',
          'in "thought" only, NEVER in "response".',
          '',
          'If the user message contains typos, misspellings, or casual shorthand, infer their intent',
          'and answer accordingly. Never respond with "I didn\'t understand" — give your best answer.',
        ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });

    // Insert conversation history between output instructions and current task
    if (conversationHistory && conversationHistory.length > 0) {
      const MAX_HISTORY_TURNS = 10;
      const MAX_HISTORY_CHARS = 32000;
      let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
      let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
      while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
        const removed = historyMessages.shift()!;
        totalChars -= removed.content.length;
      }

      const historyBlock = [
        '--- PREVIOUS CONVERSATION CONTEXT ---',
        'Use this context to understand what the user has been discussing.',
        'Do NOT repeat information already provided. Build on previous answers.',
        ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
        '--- END PREVIOUS CONVERSATION ---',
        '',
      ].join('\n');

      // Insert before the last message (which is the current task)
      messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
    }

    return messages;
  }

  private buildReviewerPrompt(
    task: string,
    draft: string,
    mode: Mode,
    conversationHistory?: Array<{ role: string; content: string }>,
    context?: string,
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
      context,
      workspaceRoot: this._workspaceRoot,
      cacheControl: DEFAULT_CACHE_CONTROL,
    });

    const outputInstructions = [
      'Respond with valid JSON matching this schema:',
      '{"thought": string, "verdict": "PASS" | "FAIL" | "NEEDS_REVISION", "confidence": number 0-1, "findings": Array<{description: string, severity: "high"|"med"|"low", evidence: string}>}',
      'The "thought" field must contain your detailed reasoning and adversarial critique.',
    ];

    if (TaskRouter.isConversationalTask(task)) {
      outputInstructions.push(
        '',
        'IMPORTANT: This is a conversational/general question, not a code task.',
        'Do NOT apply code-review criteria. Evaluate only: accuracy, completeness, clarity.',
        'Default to PASS unless the answer is factually incorrect.',
        '',
        'CRITICAL: Do NOT produce a meta-analysis like "Review findings:" or "Reviewer verdict:". instead,',
        'return the improved version of the answer directly in the "thought" field with verdict: "PASS".',
        'The user should see the answer, not your review process.',
      );
    }

    messages.splice(1, 0, { role: 'system', content: outputInstructions.join('\n') });

    if (conversationHistory && conversationHistory.length > 0) {
      const MAX_HISTORY_TURNS = 10;
      const MAX_HISTORY_CHARS = 32000;
      let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
      let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
      while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
        const removed = historyMessages.shift()!;
        totalChars -= removed.content.length;
      }

      const historyBlock = [
        '--- PREVIOUS CONVERSATION CONTEXT ---',
        'Use this context to understand what the user has been discussing.',
        ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
        '--- END PREVIOUS CONVERSATION ---',
        '',
      ].join('\n');

      messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
    }

    return messages;
  }

  private buildChallengerPrompt(
    task: string,
    draft: string,
    review: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    context?: string,
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
      context,
      workspaceRoot: this._workspaceRoot,
      cacheControl: DEFAULT_CACHE_CONTROL,
    });

    const outputInstructions = [
      'Respond with valid JSON matching this schema:',
      '{"thought": string, "response": string, "confidence": number 0-1, "issues": string[], "filesChanged": string[]}',
      'The "thought" field must contain your adversarial reasoning and architectural dissent.',
    ].join('\n');

    messages.splice(1, 0, { role: 'system', content: outputInstructions });

    if (conversationHistory && conversationHistory.length > 0) {
      const MAX_HISTORY_TURNS = 10;
      const MAX_HISTORY_CHARS = 32000;
      let historyMessages = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
      let totalChars = historyMessages.reduce((sum, m) => sum + m.content.length, 0);
      while (totalChars > MAX_HISTORY_CHARS && historyMessages.length > 2) {
        const removed = historyMessages.shift()!;
        totalChars -= removed.content.length;
      }

      const historyBlock = [
        '--- PREVIOUS CONVERSATION CONTEXT ---',
        'Use this context to understand what the user has been discussing.',
        ...historyMessages.map(m => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${m.content.slice(0, 500)}`),
        '--- END PREVIOUS CONVERSATION ---',
        '',
      ].join('\n');

      messages.splice(messages.length - 1, 0, { role: 'user', content: historyBlock });
    }

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
      // Fallback: try to extract "response" field via regex
      const responseMatch = raw.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (responseMatch) {
        return { response: responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') } as unknown as Partial<T>;
      }
      return {} as Partial<T>;
    }
  }

  private estimateCost(
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    },
    provider?: {
      getCost?: (tokens: { input: number; output: number }) => number;
      getPricing?: () => {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number;
        cacheWritePerMillion?: number;
      };
    },
  ): number {
    // Provider-truthful path: use the provider's own pricing table so
    // prompt-caching and per-model rates are honored. We compute from
    // `getPricing` rather than `getCost` because `getCost` does not
    // surface the cache rates.
    if (provider && typeof provider.getCost === 'function' && typeof provider.getPricing === 'function') {
      const pricing = provider.getPricing();
      const cacheReadTokens = usage.cacheReadTokens ?? 0;
      const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
      const uncached = Math.max(0, usage.inputTokens - cacheReadTokens);

      const inputCost =
        (uncached * pricing.inputPerMillion) / 1e6 +
        (cacheReadTokens * (pricing.cacheReadPerMillion ?? pricing.inputPerMillion)) / 1e6 +
        (cacheWriteTokens * (pricing.cacheWritePerMillion ?? pricing.inputPerMillion)) / 1e6;
      const outputCost = (usage.outputTokens * pricing.outputPerMillion) / 1e6;
      return inputCost + outputCost;
    }

    // Fallback: static rates that match the original behavior when no
    // provider hint is available (e.g. MockProvider path or tests that
    // don't pass a provider).
    const inputRate = 0.5 / 1_000_000;
    const outputRate = 1.5 / 1_000_000;
    return usage.inputTokens * inputRate + usage.outputTokens * outputRate;
  }

  private buildToolDefinitions(allowedTools?: string[]): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    if (!this.toolRegistry) return [];
    const all = this.toolRegistry.getAll();
    // Tier-aware tool budget (Stream A): when a limited tool set is supplied
    // (cheap models), expose only those. `['*']` or undefined → all tools.
    const filtered = allowedTools && !allowedTools.includes('*')
      ? all.filter((tool) => allowedTools.includes(tool.name))
      : all;
    return filtered.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ? zodToJsonSchema(tool.parameters as any) : { type: 'object' },
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

      if (result.success && result.data) {
        const outputCheck = checkToolOutput(JSON.stringify(result.data), tc.name);
        if (!outputCheck.safe && outputCheck.confidence > 0.8) {
          this.logSecurityEvent('tool_output_injection', outputCheck.confidence, outputCheck.flags, { type: 'injection', decision: 'sanitize', payload: JSON.stringify(result.data) });
          result.success = false;
          result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
          result.data = undefined;
        }
      }

      const EDIT_TOOLS = new Set(['edit_file', 'write_file', 'edit_block', 'search_replace']);
      const editFilePath = (tc.arguments.path ?? tc.arguments.filePath) as string | undefined;
      if (result.success && EDIT_TOOLS.has(tc.name) && editFilePath) {
        try {
          const lintTarget = path.isAbsolute(editFilePath)
            ? editFilePath
            : path.resolve(this._workspaceRoot, editFilePath);
          const lintResult = await this.linter.lintFile(lintTarget);
          if (!lintResult.passed && lintResult.errors.length > 0) {
            this.eventStream.append({
              type: 'lint_warning',
              tool: tc.name,
              file: tc.arguments.filePath,
              errors: lintResult.errors,
            } as any);
          }
        } catch {
          // Lint is best-effort
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
  ): Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> {
    const messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> = [...originalMessages];

    const assistantMsg: { role: string; content: string; tool_calls?: unknown[] } = {
      role: 'assistant',
      content: llmResponse.content,
    };
    if (llmResponse.toolCalls?.length) {
      assistantMsg.tool_calls = llmResponse.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) },
      }));
    }
    messages.push(assistantMsg);

    const TOOL_OUTPUT_MAX_CHARS = 8000;

    for (const tr of toolResults) {
      let dataStr = tr.result.result.data ? JSON.stringify(tr.result.result.data) : '';
      if (dataStr.length > TOOL_OUTPUT_MAX_CHARS) {
        dataStr = dataStr.slice(0, TOOL_OUTPUT_MAX_CHARS) + '\n... [truncated]';
      }

      const envelope = JSON.stringify({
        toolCallId: tr.result.toolCallId,
        toolName: tr.toolName,
        success: tr.result.result.success,
        data: dataStr,
        error: tr.result.result.error,
      });

      if (envelope.length > 2000) {
        const ref = this.toolRelay.box(envelope, {
          metadata: { toolName: tr.toolName, toolCallId: tr.result.toolCallId },
        });
        messages.push({
          role: 'tool',
          tool_call_id: tr.result.toolCallId,
          content: `[Tool output boxed — reference: ${ref.ref}]`,
        });
      } else {
        messages.push({
          role: 'tool',
          tool_call_id: tr.result.toolCallId,
          content: envelope,
        });
      }
    }

    messages.push({
      role: 'user',
      content:
        '[!] #TOOL RESULTS RECEIVED# [!]\n' +
        'The tools above have returned their results. Now you MUST synthesize a final response.\n\n' +
        'RULES:\n' +
        '1. DO NOT echo or repeat the raw tool output.\n' +
        '2. Summarize the key findings in natural language.\n' +
        '3. Return your answer as JSON: {"thought": "...", "response": "...", "confidence": 0.0-1.0}\n' +
        '4. The "response" field is what the user will see — make it clear, concise, and helpful.\n' +
        '5. If the tool failed, explain what went wrong and suggest alternatives.',
    });

    return messages;
  }
}
