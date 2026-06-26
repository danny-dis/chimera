"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseSynthesizer = void 0;
const ROLE_AUTHORITY = {
    synthesizer: 4,
    reviewer: 3,
    challenger: 2,
    writer: 1,
};
const SEVERITY_ORDER = { high: 3, med: 2, low: 1 };
function tokenize(text) {
    return new Set(text.toLowerCase().split(/\s+/));
}
function jaccard(a, b) {
    const intersection = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}
function hasOppositeSentiment(a, b) {
    const negations = ['not', "don't", "doesn't", "isn't", "wasn't", "shouldn't", "won't", "can't", 'no'];
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aNeg = negations.some((n) => aLower.includes(` ${n} `) || aLower.startsWith(`${n} `));
    const bNeg = negations.some((n) => bLower.includes(` ${n} `) || bLower.startsWith(`${n} `));
    // Substantial token overlap is enough — negation asymmetry on a shared
    // topic is what defines a contradiction. (The previous 0.5 threshold was
    // too strict for short phrases like "not using caching" vs "use caching".)
    return aNeg !== bNeg && jaccard(tokenize(a), tokenize(b)) > 0.2;
}
function roleAuthority(roleId) {
    return ROLE_AUTHORITY[roleId.split('-')[0]] ?? 0;
}
class ResponseSynthesizer {
    eventStream;
    constructor(eventStream) {
        this.eventStream = eventStream;
    }
    synthesize(inputs) {
        if (inputs.length === 0) {
            return { unifiedResponse: '', conflicts: [], mergedIssues: [], overallConfidence: 0, needsUserEscalation: false };
        }
        const conflicts = this.resolveConflicts(this.detectConflicts(inputs));
        const mergedIssues = this.mergeIssues(inputs);
        const needsUserEscalation = conflicts.some((c) => c.resolvedBy === 'user_escalation');
        const overallConfidence = this.calculateOverallConfidence(inputs, conflicts);
        const unifiedResponse = this.buildUnifiedResponse(inputs, conflicts);
        this.emitEvents(conflicts, inputs);
        return {
            unifiedResponse,
            conflicts,
            mergedIssues,
            overallConfidence,
            needsUserEscalation,
            escalationReason: needsUserEscalation
                ? conflicts.find((c) => c.resolvedBy === 'user_escalation')?.description
                : undefined,
        };
    }
    detectConflicts(inputs) {
        const conflicts = [];
        for (let i = 0; i < inputs.length; i++) {
            for (let j = i + 1; j < inputs.length; j++) {
                const a = inputs[i];
                const b = inputs[j];
                if (a.content === b.content)
                    continue;
                if (a.issues && b.issues) {
                    const aDescs = new Set(a.issues.map((x) => x.description.toLowerCase()));
                    const bDescs = new Set(b.issues.map((x) => x.description.toLowerCase()));
                    if ([...aDescs].some((d) => bDescs.has(d)))
                        continue;
                }
                if (hasOppositeSentiment(a.content, b.content)) {
                    conflicts.push({
                        type: 'contradiction',
                        description: `${a.agentId} and ${b.agentId} make opposing claims`,
                        involvedAgents: [a.agentId, b.agentId],
                        resolution: '',
                        resolvedBy: 'role_authority',
                    });
                }
                else if ((a.issues?.length ?? 0) > 0 !== (b.issues?.length ?? 0) > 0) {
                    const richer = (a.issues?.length ?? 0) >= (b.issues?.length ?? 0) ? a : b;
                    const poorer = richer === a ? b : a;
                    conflicts.push({
                        type: 'incomplete',
                        description: `${poorer.agentId} provides less detail than ${richer.agentId}`,
                        involvedAgents: [poorer.agentId, richer.agentId],
                        resolution: '',
                        resolvedBy: 'role_authority',
                    });
                }
                else if (jaccard(tokenize(a.content), tokenize(b.content)) > 0.3) {
                    conflicts.push({
                        type: 'preference',
                        description: `${a.agentId} and ${b.agentId} offer different approaches`,
                        involvedAgents: [a.agentId, b.agentId],
                        resolution: '',
                        resolvedBy: 'confidence',
                    });
                }
            }
        }
        return conflicts;
    }
    resolveConflicts(conflicts) {
        return conflicts.map((conflict) => {
            if (conflict.resolvedBy === 'user_escalation')
                return conflict;
            if (conflict.type === 'contradiction') {
                const sorted = conflict.involvedAgents
                    .map((id) => ({ id, auth: roleAuthority(id) }))
                    .sort((a, b) => b.auth - a.auth);
                if (sorted[0].auth > sorted[1].auth) {
                    return { ...conflict, resolution: `Role authority: ${sorted[0].id} overrides ${sorted[1].id}`, resolvedBy: 'role_authority' };
                }
                return { ...conflict, resolution: 'Contradiction requires user decision', resolvedBy: 'user_escalation' };
            }
            if (conflict.type === 'incomplete') {
                return { ...conflict, resolution: 'Merged with richer source', resolvedBy: 'role_authority' };
            }
            return { ...conflict, resolution: 'Higher confidence output selected', resolvedBy: 'confidence' };
        });
    }
    mergeIssues(inputs) {
        const seen = new Map();
        for (const input of inputs) {
            for (const issue of input.issues ?? []) {
                const key = issue.description.toLowerCase().trim();
                const existing = seen.get(key);
                if (!existing || (SEVERITY_ORDER[issue.severity] ?? 0) > (SEVERITY_ORDER[existing.severity] ?? 0)) {
                    seen.set(key, { ...issue, source: input.agentId });
                }
            }
        }
        return [...seen.values()].sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0));
    }
    buildUnifiedResponse(inputs, conflicts) {
        const needsEscalation = conflicts.some((c) => c.resolvedBy === 'user_escalation');
        if (needsEscalation)
            return this.buildEscalationResponse(inputs, conflicts);
        const base = conflicts.length === 0
            ? this.buildNoConflictResponse(inputs)
            : this.buildResolvedResponse(inputs, conflicts);
        return this.appendReviewerNotes(base, inputs);
    }
    /** Append reviewer high-severity issues to the response regardless of
     *  conflict resolution status — the reviewer is the quality gate. */
    appendReviewerNotes(base, inputs) {
        const reviewer = inputs.find((i) => i.role === 'reviewer');
        const highIssues = reviewer?.issues?.filter((i) => i.severity === 'high') ?? [];
        if (highIssues.length === 0)
            return base;
        return base + '\n\n[!] #CRITICAL QUALITY ADVISORY# [!]\n>>> SOURCE: SENIOR REVIEWER <<<\n' + highIssues.map((i) => `- [!] ${i.description}`).join('\n');
    }
    buildNoConflictResponse(inputs) {
        const base = [...inputs].sort((a, b) => b.confidence - a.confidence)[0];
        return base.content;
    }
    buildResolvedResponse(inputs, conflicts) {
        const base = [...inputs].sort((a, b) => b.confidence - a.confidence)[0];
        const notes = conflicts
            .filter((c) => c.resolvedBy !== 'user_escalation')
            .map((c) => `[!] #RESOLVED: ${c.description.toUpperCase()}#\n>>> ACTION: ${c.resolution.toUpperCase()}`);
        return notes.length > 0
            ? `${base.content}\n\n---\n# #CONFLICT RESOLUTION LOG# #\n${notes.join('\n\n')}`
            : base.content;
    }
    buildEscalationResponse(inputs, conflicts) {
        const escalated = conflicts.filter((c) => c.resolvedBy === 'user_escalation');
        let response = '[!] #DECISION REQUIRED: STRATEGIC DEADLOCK# [!]\n>>> ACTION: YOUR INTERVENTION IS MANDATORY <<<\n\nThe following technical conflicts could not be resolved autonomously:\n\n';
        for (const conflict of escalated) {
            response += `### #CONFLICT: ${conflict.description.toUpperCase()}#\n`;
            for (const agentId of conflict.involvedAgents) {
                const input = inputs.find((i) => i.agentId === agentId);
                if (input) {
                    response += `**AGENT: ${agentId}** (${input.role.toUpperCase()}, CONFIDENCE: ${input.confidence.toFixed(2)}):\n${input.content}\n\n`;
                }
            }
        }
        return response;
    }
    calculateOverallConfidence(inputs, conflicts) {
        if (inputs.length === 0)
            return 0;
        const maxConfidence = Math.max(...inputs.map((i) => i.confidence));
        const unresolved = conflicts.filter((c) => c.resolvedBy === 'user_escalation').length;
        const resolved = conflicts.filter((c) => c.resolvedBy !== 'user_escalation').length;
        return Math.max(0.3, Math.min(1, maxConfidence - unresolved * 0.10 - resolved * 0.05));
    }
    emitEvents(conflicts, inputs) {
        if (!this.eventStream)
            return;
        for (const conflict of conflicts) {
            if (conflict.resolvedBy === 'user_escalation') {
                this.eventStream.append({
                    type: 'disagreement_detected',
                    agents: conflict.involvedAgents,
                    issue: conflict.description,
                    resolution: 'user',
                });
            }
        }
        this.eventStream.append({
            type: 'final_response',
            status: conflicts.some((c) => c.resolvedBy === 'user_escalation') ? 'needs_user' : 'done',
            cost: 0,
            agentCount: inputs.length,
        });
    }
}
exports.ResponseSynthesizer = ResponseSynthesizer;
//# sourceMappingURL=response-synthesizer.js.map