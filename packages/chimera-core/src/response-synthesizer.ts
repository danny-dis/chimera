import { EventStream } from './event-stream.js';

export interface SynthesisInput {
  agentId: string;
  role: 'writer' | 'reviewer' | 'challenger' | 'synthesizer';
  content: string;
  confidence: number;
  issues?: Array<{ description: string; severity: string; evidence: string }>;
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
  mergedIssues: Array<{ description: string; severity: string; evidence: string; source: string }>;
  overallConfidence: number;
  needsUserEscalation: boolean;
  escalationReason?: string;
}

const ROLE_AUTHORITY: Record<string, number> = {
  synthesizer: 4,
  reviewer: 3,
  challenger: 2,
  writer: 1,
};

const SEVERITY_ORDER: Record<string, number> = { high: 3, med: 2, low: 1 };

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\s+/));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function hasOppositeSentiment(a: string, b: string): boolean {
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

function roleAuthority(roleId: string): number {
  return ROLE_AUTHORITY[roleId.split('-')[0]] ?? 0;
}

export class ResponseSynthesizer {
  constructor(private eventStream?: EventStream) {}

  synthesize(inputs: SynthesisInput[]): SynthesisResult {
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

  private detectConflicts(inputs: SynthesisInput[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (let i = 0; i < inputs.length; i++) {
      for (let j = i + 1; j < inputs.length; j++) {
        const a = inputs[i];
        const b = inputs[j];
        if (a.content === b.content) continue;

        if (a.issues && b.issues) {
          const aDescs = new Set(a.issues.map((x) => x.description.toLowerCase()));
          const bDescs = new Set(b.issues.map((x) => x.description.toLowerCase()));
          if ([...aDescs].some((d) => bDescs.has(d))) continue;
        }

        if (hasOppositeSentiment(a.content, b.content)) {
          conflicts.push({
            type: 'contradiction',
            description: `${a.agentId} and ${b.agentId} make opposing claims`,
            involvedAgents: [a.agentId, b.agentId],
            resolution: '',
            resolvedBy: 'role_authority',
          });
        } else if ((a.issues?.length ?? 0) > 0 !== (b.issues?.length ?? 0) > 0) {
          const richer = (a.issues?.length ?? 0) >= (b.issues?.length ?? 0) ? a : b;
          const poorer = richer === a ? b : a;
          conflicts.push({
            type: 'incomplete',
            description: `${poorer.agentId} provides less detail than ${richer.agentId}`,
            involvedAgents: [poorer.agentId, richer.agentId],
            resolution: '',
            resolvedBy: 'role_authority',
          });
        } else if (jaccard(tokenize(a.content), tokenize(b.content)) > 0.3) {
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

  private resolveConflicts(conflicts: Conflict[]): Conflict[] {
    return conflicts.map((conflict) => {
      if (conflict.resolvedBy === 'user_escalation') return conflict;

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

  private mergeIssues(inputs: SynthesisInput[]): Array<{ description: string; severity: string; evidence: string; source: string }> {
    const seen = new Map<string, { description: string; severity: string; evidence: string; source: string }>();
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

  private buildUnifiedResponse(inputs: SynthesisInput[], conflicts: Conflict[]): string {
    const needsEscalation = conflicts.some((c) => c.resolvedBy === 'user_escalation');
    if (needsEscalation) return this.buildEscalationResponse(inputs, conflicts);
    const base = conflicts.length === 0
      ? this.buildNoConflictResponse(inputs)
      : this.buildResolvedResponse(inputs, conflicts);
    return this.appendReviewerNotes(base, inputs);
  }

  /** Append reviewer high-severity issues to the response regardless of
   *  conflict resolution status — the reviewer is the quality gate. */
  private appendReviewerNotes(base: string, inputs: SynthesisInput[]): string {
    const reviewer = inputs.find((i) => i.role === 'reviewer');
    const highIssues = reviewer?.issues?.filter((i) => i.severity === 'high') ?? [];
    if (highIssues.length === 0) return base;
    return base + '\n\n[!] #CRITICAL QUALITY ADVISORY# [!]\n>>> SOURCE: SENIOR REVIEWER <<<\n' + highIssues.map((i) => `- [!] ${i.description}`).join('\n');
  }

  private buildNoConflictResponse(inputs: SynthesisInput[]): string {
    const base = [...inputs].sort((a, b) => b.confidence - a.confidence)[0];
    return base.content;
  }

  private buildResolvedResponse(inputs: SynthesisInput[], conflicts: Conflict[]): string {
    const base = [...inputs].sort((a, b) => b.confidence - a.confidence)[0];
    const notes = conflicts
      .filter((c) => c.resolvedBy !== 'user_escalation')
      .map((c) => `[!] #RESOLVED: ${c.description.toUpperCase()}#\n>>> ACTION: ${c.resolution.toUpperCase()}`);
    return notes.length > 0
      ? `${base.content}\n\n---\n# #CONFLICT RESOLUTION LOG# #\n${notes.join('\n\n')}`
      : base.content;
  }

  private buildEscalationResponse(inputs: SynthesisInput[], conflicts: Conflict[]): string {
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

  private calculateOverallConfidence(inputs: SynthesisInput[], conflicts: Conflict[]): number {
    if (inputs.length === 0) return 0;
    const maxConfidence = Math.max(...inputs.map((i) => i.confidence));
    const unresolved = conflicts.filter((c) => c.resolvedBy === 'user_escalation').length;
    const resolved = conflicts.filter((c) => c.resolvedBy !== 'user_escalation').length;
    return Math.max(0.3, Math.min(1, maxConfidence - unresolved * 0.10 - resolved * 0.05));
  }

  private emitEvents(conflicts: Conflict[], inputs: SynthesisInput[]): void {
    if (!this.eventStream) return;
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
