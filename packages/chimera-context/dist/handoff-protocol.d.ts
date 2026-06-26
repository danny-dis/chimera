import type { ChimeraEvent, HandoffDocument, HandoffChecklist, HandoffDelta } from './types.js';
export type HandoffProposal = {
    claimId: string;
    type: 'fact' | 'plan' | 'warning' | 'decision';
    content: string;
    confidence: number;
    source: string;
    evidenceRef?: string;
};
export declare class HandoffProtocol {
    private proposals;
    private checkpoints;
    addClaim(proposal: HandoffProposal): void;
    getClaim(id: string): HandoffProposal | undefined;
    getAllClaims(): HandoffProposal[];
    addCheckpoint(index: number, description: string): void;
    getCheckpoints(): Array<{
        index: number;
        description: string;
    }>;
    createCompactingHandoff(events: ChimeraEvent[], context?: {
        session?: string;
        agent?: string;
        provider?: string;
        contextFill?: number;
    }): HandoffDocument;
    createDeltaHandoff(baseId: string, oldEvents: ChimeraEvent[], newEvents: ChimeraEvent[]): HandoffDelta;
    serializeHandoff(doc: HandoffDocument): string;
    parseHandoff(text: string): HandoffDocument;
    serializeDelta(delta: HandoffDelta): string;
    parseDelta(text: string): HandoffDelta;
    validateHandoff(document: HandoffDocument): HandoffChecklist;
    private summarizeEvents;
    private extractNextSteps;
    private extractDecisions;
    private extractContextFacts;
    private extractFilesModified;
    private extractFilesRead;
    private extractErrors;
    private diffEvents;
    private checkDataCompleteness;
    private checkReferences;
    private checkClaims;
    private checkCapabilities;
}
//# sourceMappingURL=handoff-protocol.d.ts.map