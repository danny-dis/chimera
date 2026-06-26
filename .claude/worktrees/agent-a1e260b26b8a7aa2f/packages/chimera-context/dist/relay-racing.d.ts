import type { ChimeraEvent, HandoffDocument, HandoffChecklist } from '@chimera/core';
export interface ContextThreshold {
    tier: 'healthy' | 'warning' | 'critical' | 'emergency';
    fillPercent: number;
    remainingTokens: number;
    recommendedAction: 'continue' | 'mask' | 'handoff' | 'emergency_handoff';
}
export interface ObservationMask {
    original: string;
    masked: string;
    tokensSaved: number;
}
export interface HandoffResult {
    handoffDocument: HandoffDocument;
    serialized: string;
    validation: HandoffChecklist;
    isValid: boolean;
    tokensSaved: number;
}
export declare class RelayRacing {
    private agents;
    private handoffProtocol;
    private maskedObservations;
    constructor(params?: {
        defaultContextWindow?: number;
    });
    registerAgent(agentId: string, maxTokens?: number): void;
    unregisterAgent(agentId: string): void;
    trackTokens(agentId: string, delta: number): ContextThreshold;
    getAgentFill(agentId: string): number;
    getThreshold(agentId: string): ContextThreshold;
    shouldMask(agentId: string): boolean;
    maskObservations(messages: Array<{
        role: string;
        content: string;
    }>): Array<{
        role: string;
        content: string;
    }>;
    trackMaskedObservation(agentId: string, original: string, masked: string): void;
    maskToolCalls(messages: Array<{
        role: string;
        content: string;
    }>): Array<{
        role: string;
        content: string;
    }>;
    shouldHandoff(agentId: string): boolean;
    triggerHandoff(params: {
        agentId: string;
        events: ChimeraEvent[];
        fromAgent: string;
        toAgent: string;
    }): HandoffResult;
    private compactForHandoff;
}
//# sourceMappingURL=relay-racing.d.ts.map