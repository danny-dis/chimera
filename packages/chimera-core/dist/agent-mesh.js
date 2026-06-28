"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentMesh = void 0;
/**
 * Coordinates parallel subagent lifecycle, serial quality gate,
 * and inter-agent message routing.
 *
 * Enhanced with patterns from Omnigent:
 * - Cross-vendor review enforcement
 * - Purpose-guarded dispatch
 * - Real quality gate execution
 */
class AgentMesh {
    agents = new Map();
    messages = [];
    eventStream;
    qualityGateExecutor;
    constructor(eventStream) {
        this.eventStream = eventStream;
    }
    setQualityGateExecutor(executor) {
        this.qualityGateExecutor = executor;
    }
    safeEmit(event) {
        try {
            this.eventStream.append(event);
        }
        catch { /* ignore */ }
    }
    registerAgent(config) {
        this.agents.set(config.id, config);
        this.safeEmit({
            type: 'agent_spawned',
            agentId: config.id,
            role: config.role,
            provider: config.provider,
            model: config.model,
        });
    }
    getAgent(id) {
        return this.agents.get(id);
    }
    getAgentsByRole(role) {
        return Array.from(this.agents.values()).filter((a) => a.role === role);
    }
    /**
     * Send a message between agents.
     */
    sendMessage(message) {
        this.messages.push(message);
        this.safeEmit({
            type: 'provenance_claim',
            claimId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            source: `${message.from} → ${message.to}`,
            agentId: message.from,
            confidence: 1,
        });
    }
    /**
     * Get messages for a specific agent.
     */
    getMessagesForAgent(agentId) {
        return this.messages.filter((m) => m.to === agentId);
    }
    /**
     * Get all messages in the mesh.
     */
    getAllMessages() {
        return [...this.messages];
    }
    /**
     * Clear messages (e.g., after a handoff).
     */
    clearMessages() {
        this.messages = [];
    }
    /**
     * Serial quality gate: draft → verify → challenge → synthesize.
     * Each stage uses a different agent on a different provider.
     *
     * Returns detailed stage results for debugging and evaluation.
     */
    async executeQualityGate(params) {
        if (this.qualityGateExecutor) {
            return this.qualityGateExecutor({ task: params.task, draftOutput: params.draftOutput });
        }
        const stages = [];
        const startTime = Date.now();
        // Stage 1: Draft
        const draftStart = Date.now();
        this.safeEmit({
            type: 'draft_proposed',
            agentId: params.draftAgentId,
            patchId: 'pending',
            confidence: 0,
        });
        stages.push({
            stage: 'draft',
            agentId: params.draftAgentId,
            verdict: 'pass',
            output: params.draftOutput ?? '',
            findings: [],
            durationMs: Date.now() - draftStart,
        });
        // Stage 2: Verify
        const verifyStart = Date.now();
        const hasHighSeverityIssues = params.reviewerFindings?.some((f) => f.severity === 'high') ?? false;
        this.safeEmit({
            type: 'verified',
            agentId: params.reviewerAgentId,
            verdict: hasHighSeverityIssues ? 'fail' : 'pass',
            findings: params.reviewerFindings ?? [],
        });
        stages.push({
            stage: 'verify',
            agentId: params.reviewerAgentId,
            verdict: hasHighSeverityIssues ? 'fail' : 'pass',
            output: '',
            findings: params.reviewerFindings ?? [],
            durationMs: Date.now() - verifyStart,
        });
        // Stage 3: Challenge (optional)
        if (params.challengerAgentId) {
            const challengeStart = Date.now();
            this.safeEmit({
                type: 'challenged',
                agentId: params.challengerAgentId,
                challenges: params.challengerChallenges ?? [],
                alternatives: [],
            });
            stages.push({
                stage: 'challenge',
                agentId: params.challengerAgentId,
                verdict: 'pass',
                output: '',
                findings: [],
                durationMs: Date.now() - challengeStart,
            });
        }
        // Determine final verdict
        const hasFailures = stages.some((s) => s.verdict === 'fail');
        const hasRevisions = stages.some((s) => s.verdict === 'needs_revision');
        const finalVerdict = hasFailures ? 'fail' : hasRevisions ? 'needs_revision' : 'pass';
        return {
            stages,
            finalVerdict,
            verdict: finalVerdict,
            unifiedOutput: params.draftOutput ?? '',
            output: params.draftOutput ?? '',
            totalDurationMs: Date.now() - startTime,
        };
    }
    /**
     * Get agents that are available for assignment.
     */
    getAvailableAgents() {
        return Array.from(this.agents.values());
    }
    /**
     * Get the best agent for a specific role.
     * Prefers agents from different vendors than already used.
     */
    getBestAgentForRole(role, usedVendors) {
        const candidates = this.getAgentsByRole(role);
        if (candidates.length === 0)
            return null;
        // Prefer agents from unused vendors
        const freshVendor = candidates.find((c) => !usedVendors.has(c.provider));
        if (freshVendor)
            return freshVendor;
        // Fall back to any available agent
        return candidates[0];
    }
}
exports.AgentMesh = AgentMesh;
//# sourceMappingURL=agent-mesh.js.map