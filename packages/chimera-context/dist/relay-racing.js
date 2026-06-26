"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayRacing = void 0;
const handoff_protocol_js_1 = require("./handoff-protocol.js");
const MASK_OUTPUT_LIMIT = 200;
const MASK_ARGS_LIMIT = 100;
class RelayRacing {
    agents = new Map();
    handoffProtocol;
    maskedObservations = new Map();
    constructor(params) {
        this.handoffProtocol = new handoff_protocol_js_1.HandoffProtocol();
        this.agents.set('default', {
            tokens: 0,
            maxTokens: params?.defaultContextWindow ?? 200_000,
        });
    }
    registerAgent(agentId, maxTokens) {
        this.agents.set(agentId, {
            tokens: 0,
            maxTokens: maxTokens ?? 200_000,
        });
    }
    unregisterAgent(agentId) {
        this.agents.delete(agentId);
        this.maskedObservations.delete(agentId);
    }
    trackTokens(agentId, delta) {
        const state = this.agents.get(agentId);
        if (!state)
            throw new Error(`Agent ${agentId} not registered`);
        state.tokens = Math.max(0, state.tokens + delta);
        return this.getThreshold(agentId);
    }
    getAgentFill(agentId) {
        const state = this.agents.get(agentId);
        if (!state)
            throw new Error(`Agent ${agentId} not registered`);
        return state.tokens / state.maxTokens;
    }
    getThreshold(agentId) {
        const state = this.agents.get(agentId);
        if (!state)
            throw new Error(`Agent ${agentId} not registered`);
        const fillPercent = state.tokens / state.maxTokens;
        const remainingTokens = state.maxTokens - state.tokens;
        if (fillPercent >= 0.80) {
            return {
                tier: 'emergency',
                fillPercent,
                remainingTokens,
                recommendedAction: 'emergency_handoff',
            };
        }
        if (fillPercent >= 0.65) {
            return {
                tier: 'critical',
                fillPercent,
                remainingTokens,
                recommendedAction: 'handoff',
            };
        }
        if (fillPercent >= 0.50) {
            return {
                tier: 'warning',
                fillPercent,
                remainingTokens,
                recommendedAction: 'mask',
            };
        }
        return {
            tier: 'healthy',
            fillPercent,
            remainingTokens,
            recommendedAction: 'continue',
        };
    }
    shouldMask(agentId) {
        return this.getThreshold(agentId).recommendedAction === 'mask';
    }
    maskObservations(messages) {
        return messages.map((msg) => {
            if (msg.role !== 'tool' && msg.role !== 'function') {
                return msg;
            }
            const isToolOutput = msg.content.length > MASK_OUTPUT_LIMIT + 30;
            if (!isToolOutput)
                return msg;
            const masked = `${msg.content.slice(0, MASK_OUTPUT_LIMIT)}... [masked]`;
            return { ...msg, content: masked };
        });
    }
    trackMaskedObservation(agentId, original, masked) {
        if (!this.maskedObservations.has(agentId)) {
            this.maskedObservations.set(agentId, []);
        }
        this.maskedObservations.get(agentId).push({
            original,
            masked,
            tokensSaved: Math.ceil((original.length - masked.length) / 4),
        });
    }
    maskToolCalls(messages) {
        return messages.map((msg) => {
            if (msg.role !== 'assistant')
                return msg;
            const hasToolCalls = msg.content.includes('<tool_use>') ||
                msg.content.includes('"tool_call"') ||
                msg.content.includes('function_call');
            if (!hasToolCalls)
                return msg;
            const signatureEnd = msg.content.indexOf('\n');
            if (signatureEnd === -1 || signatureEnd <= MASK_ARGS_LIMIT)
                return msg;
            const signature = msg.content.slice(0, MASK_ARGS_LIMIT);
            return { ...msg, content: `${signature}... [truncated]` };
        });
    }
    shouldHandoff(agentId) {
        const action = this.getThreshold(agentId).recommendedAction;
        return action === 'handoff' || action === 'emergency_handoff';
    }
    triggerHandoff(params) {
        const { agentId, events } = params;
        const { tokensSaved } = this.compactForHandoff(agentId);
        const handoffDocument = this.handoffProtocol.createCompactingHandoff(events);
        const serialized = JSON.stringify(handoffDocument);
        const validation = this.handoffProtocol.validateHandoff(handoffDocument);
        const isValid = validation.dataComplete &&
            validation.referencesGrounded &&
            validation.claimsVerified &&
            validation.capabilityMatch;
        const state = this.agents.get(agentId);
        if (state) {
            state.tokens = Math.max(0, state.tokens - tokensSaved);
        }
        return {
            handoffDocument,
            serialized,
            validation,
            isValid,
            tokensSaved,
        };
    }
    compactForHandoff(agentId) {
        const state = this.agents.get(agentId);
        if (!state)
            return { compacted: '', tokensSaved: 0 };
        const masks = this.maskedObservations.get(agentId) ?? [];
        const tokensSaved = masks.reduce((sum, m) => sum + m.tokensSaved, 0);
        const fillPercent = (state.tokens / state.maxTokens * 100).toFixed(1);
        const compacted = `[Compacted context — ${fillPercent}% used, ${masks.length} observations masked]`;
        return { compacted, tokensSaved };
    }
}
exports.RelayRacing = RelayRacing;
//# sourceMappingURL=relay-racing.js.map