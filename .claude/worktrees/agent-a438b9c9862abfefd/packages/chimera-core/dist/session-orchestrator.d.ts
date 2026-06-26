import { EventStream } from './event-stream.js';
import { CostTracker } from './cost-tracker.js';
import type { LongTermMemory } from './memory/long-term-memory.js';
import { Mode, type ToolCall } from './types/agent.js';
import { ChimeraEvent } from './types/events.js';
import { ComplexityScore } from './types/router.js';
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
    }): Promise<{
        content: string;
        toolCalls?: ToolCall[];
        usage: {
            inputTokens: number;
            outputTokens: number;
        };
    }>;
}
export interface ToolExecutorInterface {
    execute(toolName: string, params: Record<string, unknown>, context: {
        workspaceRoot: string;
        sessionId: string;
        eventStream: EventStream;
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
    private _workspaceRoot;
    constructor(eventStream?: EventStream, tools?: {
        registry: ToolRegistryInterface;
        executor: ToolExecutorInterface;
    }, workspaceRoot?: string, memory?: LongTermMemory);
    getState(): OrchestratorState;
    getEventStream(): EventStream;
    getCostTracker(): CostTracker;
    /**
     * Export current session state for persistence.
     */
    exportState(sessionId: string, task: string, mode: Mode): {
        sessionId: string;
        timestamp: string;
        task: string;
        mode: Mode;
        messages: Array<{
            role: 'system' | 'user' | 'assistant' | 'tool';
            content: string;
        }>;
        events: ChimeraEvent[];
        costSpend: Record<string, number>;
        metadata: {
            agentCount: number;
            turnCount: number;
            status: 'active' | 'completed' | 'failed';
        };
    };
    private buildAgentConfig;
    execute(params: {
        task: string;
        mode: Mode;
        providers: {
            writer: LLMProvider;
            reviewer: LLMProvider;
            challenger?: LLMProvider;
        };
        maxRetries?: number;
        costCap?: number;
    }): Promise<OrchestratorResult>;
    private finalize;
    private toSynthesisInputs;
    executeQualityGateParallel(params: {
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
    }>;
    private transition;
    private shouldVerify;
    buildWriterPrompt(task: string, mode: Mode): Array<{
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