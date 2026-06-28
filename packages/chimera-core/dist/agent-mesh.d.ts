import { EventStream } from './event-stream.js';
import { AgentConfig, AgentRole } from './types/agent.js';
/**
 * Inter-agent message for communication between agents.
 */
export interface AgentMessage {
    from: string;
    to: string;
    type: 'review_request' | 'review_result' | 'challenge' | 'synthesis_input' | 'handoff';
    content: string;
    metadata?: Record<string, unknown>;
}
/**
 * Quality gate stage result.
 */
export interface QualityGateStage {
    stage: 'draft' | 'verify' | 'challenge' | 'synthesize';
    agentId: string;
    verdict: 'pass' | 'fail' | 'needs_revision';
    output: string;
    findings: Array<{
        description: string;
        severity: 'high' | 'med' | 'low';
        evidence: string;
    }>;
    durationMs: number;
}
/**
 * Quality gate result.
 */
export interface QualityGateResult {
    stages: QualityGateStage[];
    finalVerdict: 'pass' | 'fail' | 'needs_revision';
    verdict: 'pass' | 'fail' | 'needs_revision';
    unifiedOutput: string;
    output: string;
    totalDurationMs: number;
}
/**
 * Coordinates parallel subagent lifecycle, serial quality gate,
 * and inter-agent message routing.
 *
 * Enhanced with patterns from Omnigent:
 * - Cross-vendor review enforcement
 * - Purpose-guarded dispatch
 * - Real quality gate execution
 */
export declare class AgentMesh {
    private agents;
    private messages;
    private eventStream;
    private qualityGateExecutor?;
    constructor(eventStream: EventStream);
    setQualityGateExecutor(executor: (params: {
        task: string;
        draftOutput?: string;
    }) => Promise<QualityGateResult>): void;
    private safeEmit;
    registerAgent(config: AgentConfig): void;
    getAgent(id: string): AgentConfig | undefined;
    getAgentsByRole(role: AgentRole): AgentConfig[];
    /**
     * Send a message between agents.
     */
    sendMessage(message: AgentMessage): void;
    /**
     * Get messages for a specific agent.
     */
    getMessagesForAgent(agentId: string): AgentMessage[];
    /**
     * Get all messages in the mesh.
     */
    getAllMessages(): AgentMessage[];
    /**
     * Clear messages (e.g., after a handoff).
     */
    clearMessages(): void;
    /**
     * Serial quality gate: draft → verify → challenge → synthesize.
     * Each stage uses a different agent on a different provider.
     *
     * Returns detailed stage results for debugging and evaluation.
     */
    executeQualityGate(params: {
        draftAgentId: string;
        reviewerAgentId: string;
        challengerAgentId?: string;
        task: string;
        draftOutput?: string;
        reviewerFindings?: Array<{
            description: string;
            severity: 'high' | 'med' | 'low';
            evidence: string;
        }>;
        challengerChallenges?: string[];
    }): Promise<QualityGateResult>;
    /**
     * Get agents that are available for assignment.
     */
    getAvailableAgents(): AgentConfig[];
    /**
     * Get the best agent for a specific role.
     * Prefers agents from different vendors than already used.
     */
    getBestAgentForRole(role: AgentRole, usedVendors: Set<string>): AgentConfig | null;
}
//# sourceMappingURL=agent-mesh.d.ts.map