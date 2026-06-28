import { EventStream } from './event-stream.js';
export interface SynthesisInput {
    agentId: string;
    role: 'writer' | 'reviewer' | 'challenger' | 'synthesizer';
    content: string;
    confidence: number;
    issues?: Array<{
        description: string;
        severity: string;
        evidence: string;
    }>;
    challenges?: string[];
    alternatives?: string[];
}
export interface Conflict {
    type: 'contradiction' | 'incomplete' | 'preference';
    description: string;
    involvedAgents: string[];
    resolution: string;
    resolvedBy: 'role_authority' | 'confidence' | 'user_escalation';
}
export interface SynthesisResult {
    unifiedResponse: string;
    conflicts: Conflict[];
    mergedIssues: Array<{
        description: string;
        severity: string;
        evidence: string;
        source: string;
    }>;
    overallConfidence: number;
    needsUserEscalation: boolean;
    escalationReason?: string;
}
/**
 * ResponseSynthesizer — merges outputs from multiple agents into a unified response.
 *
 * Follows the "moderator-not-debater" pattern from Omnigent:
 * - The synthesizer is a moderator, not a third debater
 * - Its role is to surface agreements, disagreements, and converge
 * - It does NOT inject its own position as a third competing view
 * - The synthesis is a combined answer, NOT a new third position
 */
export declare class ResponseSynthesizer {
    private eventStream?;
    constructor(eventStream?: EventStream);
    synthesize(inputs: SynthesisInput[]): SynthesisResult;
    private detectConflicts;
    private resolveConflicts;
    private mergeIssues;
    private buildUnifiedResponse;
    /** Append reviewer high-severity issues to the response regardless of
     *  conflict resolution status — the reviewer is the quality gate. */
    private appendReviewerNotes;
    private buildNoConflictResponse;
    private buildResolvedResponse;
    private buildEscalationResponse;
    private calculateOverallConfidence;
    private safeEmit;
    private emitEvents;
}
//# sourceMappingURL=response-synthesizer.d.ts.map