import { EventStream } from './event-stream.js';
import { CostTracker } from './cost-tracker.js';
import { AuditLog } from './security/audit-log.js';
import type { LongTermMemory } from './memory/long-term-memory.js';
import { Mode, type ToolCall } from './types/agent.js';
import { ChimeraEvent } from './types/events.js';
import { ComplexityScore } from './types/router.js';
import { ContextEngine } from '@chimera/context';
import { BudgetEnforcer } from '@chimera/providers';
import { RateLimiter } from '@chimera/providers';
import type { ModelRegistry } from '@chimera/providers';
import type { DeliberationMode, DeliberationResult } from './coordinator/deliberation/types.js';
import type { MemoryPersistence } from './memory/memory-persistence.js';
import type { AutoExtractService } from './memory/auto-extract.js';
import type { RecallService } from './memory/recall-service.js';
import type { AutoDreamService } from './memory/auto-dream.js';
export interface LLMProvider {
    complete(messages: Array<{
        role: string;
        content: string;
    }>, options?: {
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
        cacheControl?: {
            type: 'ephemeral';
            ttl?: '5m' | '1h';
        };
        /** Native reasoning effort, forwarded to providers that support it. */
        reasoning?: {
            effort?: 'low' | 'medium' | 'high';
            maxTokens?: number;
        };
    }): Promise<{
        content: string;
        toolCalls?: ToolCall[];
        usage: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        };
    }>;
    getCost?: (tokens: {
        input: number;
        output: number;
    }) => number;
    getPricing?: () => {
        inputPerMillion: number;
        outputPerMillion: number;
        cacheReadPerMillion?: number;
        cacheWritePerMillion?: number;
    };
}
export interface ToolExecutorInterface {
    execute(toolName: string, params: Record<string, unknown>, context: {
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
    }): Promise<{
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
        duration: number;
    }>;
}
export interface ToolRegistryInterface {
    getAll(): Array<{
        name: string;
        description: string;
        parameters: {
            toJSON?: () => Record<string, unknown>;
        };
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
    issues?: Array<{
        description: string;
        severity: 'high' | 'med' | 'low';
        evidence: string;
    }>;
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
type OrchestratorState = {
    status: 'idle';
} | {
    status: 'classifying';
    task: string;
} | {
    status: 'planning';
    task: string;
    complexity: ComplexityScore;
} | {
    status: 'drafting';
    task: string;
    agentId: string;
} | {
    status: 'verifying';
    task: string;
    draft: string;
    agentId: string;
} | {
    status: 'challenging';
    task: string;
    draft: string;
    review: string;
    agentId: string;
} | {
    status: 'synthesizing';
    task: string;
    outputs: AgentOutput[];
} | {
    status: 'complete';
    result: string;
    cost: number;
} | {
    status: 'error';
    error: string;
};
export declare class SessionOrchestrator {
    private state;
    private eventStream;
    private costTracker;
    private taskRouter;
    private agentMesh;
    private synthesizer;
    private toolRegistry;
    private toolExecutor;
    private memory;
    private contextEngine;
    private budgetEnforcer;
    private rateLimiter;
    private auditLog;
    private relayRacing;
    private handoffProtocol;
    private linter;
    private _workspaceRoot;
    private maskedObservations;
    private maskedTokensSaved;
    private workflowExecutor;
    private _sessionId;
    private _writerMessages;
    private _registry;
    private autoExtract;
    private recallService;
    private autoDream;
    private _extractionCursor;
    toolCallHistory: Array<{
        toolName: string;
        args: Record<string, unknown>;
        result: any;
    }>;
    private _lastComplexity;
    constructor(eventStream?: EventStream, tools?: {
        registry: ToolRegistryInterface;
        executor: ToolExecutorInterface;
    }, workspaceRoot?: string, memory?: LongTermMemory, options?: {
        contextEngine?: ContextEngine;
        budgetEnforcer?: BudgetEnforcer;
        rateLimiter?: RateLimiter;
        auditLog?: AuditLog;
        registry?: ModelRegistry;
        memoryPersistence?: MemoryPersistence;
        autoExtract?: AutoExtractService;
        recallService?: RecallService;
        autoDream?: AutoDreamService;
    });
    setWorkflowExecutor(executor: {
        execute(script: string): Promise<any>;
    }): void;
    executeWorkflow(task: string, providers: {
        writer: LLMProvider;
    }): Promise<any>;
    getState(): OrchestratorState;
    getEventStream(): EventStream;
    getCostTracker(): CostTracker;
    getAuditLog(): AuditLog;
    exportState(sessionId: string, task: string, mode: Mode): any;
    restoreState(checkpoint: any): Promise<void>;
    private buildAgentConfig;
    execute(params: {
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
        conversationHistory?: Array<{
            role: string;
            content: string;
        }>;
    }): Promise<OrchestratorResult>;
    /**
     * Conversational fast path: single LLM call with plain text output.
     * Bypasses the full multi-agent pipeline (no reviewer, no challenger,
     * no JSON schema) for simple questions like "who are you?", "what can you do?",
     * "where do you need tuning?", etc.
     */
    private executeConversational;
    executeWithDeliberation(task: string, mode: Mode, providers: {
        writer: LLMProvider;
        reviewer: LLMProvider;
        challenger?: LLMProvider;
    }, costCap?: number, preset?: DeliberationMode, complexity?: ComplexityScore, context?: string, conversationHistory?: Array<{
        role: string;
        content: string;
    }>): Promise<DeliberationResult>;
    private buildProviderFactory;
    private mapModeToDeliberationMode;
    private buildDeliberationConfig;
    private deliberationToOrchestratorResult;
    private finalize;
    private toSynthesisInputs;
    /**
     * Run the reviewer step: build the prompt, call the provider, parse
     * the structured verdict, register the agent in the mesh, and record
     * the cost.
     */
    private runReviewer;
    /**
     * Run the challenger step: build the prompt, call the provider,
     * parse the structured output, register the agent in the mesh, and
     * record the cost.
     */
    private runChallenger;
    /**
     * Side-effect helper: push a reviewer result into `outputs` and
     * append the `verified` event.
     */
    private processReviewerResult;
    /**
     * Side-effect helper: push a challenger result into `outputs` and
     * append the `challenged` event.
     */
    private processChallengerResult;
    /**
     * Convert a parsed review verdict + findings into a human-readable
     * summary suitable for use as an agent's `content` field.
     */
    private buildReviewerSummary;
    /**
     * P0.7 — Apply relay-racing observation masking before the next LLM
     * call. Caps tool/function outputs and trims assistant tool-call
     * signatures so the writer's context window does not fill up on
     * redundant tool noise. Mirrors the behavior of @chimera/context's
     * RelayRacing.maskObservations / RelayRacing.maskToolCalls.
     */
    private maskRelayObservations;
    executeQualityGateParallel(params: {
        task: string;
        draft: string;
        mode: Mode;
        providers: {
            reviewer: LLMProvider;
            challenger?: LLMProvider;
        };
        costCap: number;
        conversationHistory?: Array<{
            role: string;
            content: string;
        }>;
    }): Promise<{
        qualityGate: QualityGateResult;
        execution: ParallelExecutionResult;
        outputs: AgentOutput[];
    }>;
    private transition;
    private checkBudget;
    private enforceRateLimit;
    private logLLMCall;
    private logToolCall;
    private logSecurityEvent;
    private shouldVerify;
    buildWriterPrompt(task: string, mode: Mode, conversationHistory?: Array<{
        role: string;
        content: string;
    }>, context?: string): Array<{
        role: string;
        content: string;
    }>;
    private buildReviewerPrompt;
    private buildChallengerPrompt;
    private parseJSON;
    private estimateCost;
    private buildToolDefinitions;
    private executeToolCalls;
    private buildToolResultMessages;
}
export {};
//# sourceMappingURL=session-orchestrator.d.ts.map