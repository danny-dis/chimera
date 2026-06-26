import { EventStream } from './event-stream.js';
import { AgentConfig, AgentRole } from './types/agent.js';
/**
 * Coordinates parallel subagent lifecycle, serial quality gate,
 * and inter-agent message routing.
 */
export declare class AgentMesh {
    private agents;
    private eventStream;
    constructor(eventStream: EventStream);
    registerAgent(config: AgentConfig): void;
    getAgent(id: string): AgentConfig | undefined;
    getAgentsByRole(role: AgentRole): AgentConfig[];
    /**
     * Serial quality gate: draft → verify → challenge → synthesize.
     * Each stage uses a different agent on a different provider.
     */
    executeQualityGate(params: {
        draftAgentId: string;
        reviewerAgentId: string;
        challengerAgentId?: string;
        task: string;
    }): Promise<{
        verdict: string;
        output: string;
    }>;
}
//# sourceMappingURL=agent-mesh.d.ts.map