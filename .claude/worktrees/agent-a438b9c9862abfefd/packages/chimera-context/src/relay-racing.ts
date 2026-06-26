import type { ChimeraEvent, HandoffDocument, HandoffChecklist } from '@chimera/core';
import { HandoffProtocol } from './handoff-protocol.js';

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

interface AgentState {
  tokens: number;
  maxTokens: number;
}

const MASK_OUTPUT_LIMIT = 200;
const MASK_ARGS_LIMIT = 100;

export class RelayRacing {
  private agents = new Map<string, AgentState>();
  private handoffProtocol: HandoffProtocol;
  private maskedObservations = new Map<string, ObservationMask[]>();

  constructor(params?: { defaultContextWindow?: number }) {
    this.handoffProtocol = new HandoffProtocol();
    this.agents.set('default', {
      tokens: 0,
      maxTokens: params?.defaultContextWindow ?? 200_000,
    });
  }

  registerAgent(agentId: string, maxTokens?: number): void {
    this.agents.set(agentId, {
      tokens: 0,
      maxTokens: maxTokens ?? 200_000,
    });
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.maskedObservations.delete(agentId);
  }

  trackTokens(agentId: string, delta: number): ContextThreshold {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent ${agentId} not registered`);
    state.tokens = Math.max(0, state.tokens + delta);
    return this.getThreshold(agentId);
  }

  getAgentFill(agentId: string): number {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent ${agentId} not registered`);
    return state.tokens / state.maxTokens;
  }

  getThreshold(agentId: string): ContextThreshold {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent ${agentId} not registered`);

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

  shouldMask(agentId: string): boolean {
    return this.getThreshold(agentId).recommendedAction === 'mask';
  }

  maskObservations(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => {
      if (msg.role !== 'tool' && msg.role !== 'function') {
        return msg;
      }

      const isToolOutput = msg.content.length > MASK_OUTPUT_LIMIT + 30;
      if (!isToolOutput) return msg;

      const masked = `${msg.content.slice(0, MASK_OUTPUT_LIMIT)}... [masked]`;
      return { ...msg, content: masked };
    });
  }

  trackMaskedObservation(
    agentId: string,
    original: string,
    masked: string,
  ): void {
    if (!this.maskedObservations.has(agentId)) {
      this.maskedObservations.set(agentId, []);
    }
    this.maskedObservations.get(agentId)!.push({
      original,
      masked,
      tokensSaved: Math.ceil((original.length - masked.length) / 4),
    });
  }

  maskToolCalls(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => {
      if (msg.role !== 'assistant') return msg;

      const hasToolCalls = msg.content.includes('<tool_use>') ||
        msg.content.includes('"tool_call"') ||
        msg.content.includes('function_call');
      if (!hasToolCalls) return msg;

      const signatureEnd = msg.content.indexOf('\n');
      if (signatureEnd === -1 || signatureEnd <= MASK_ARGS_LIMIT) return msg;

      const signature = msg.content.slice(0, MASK_ARGS_LIMIT);
      return { ...msg, content: `${signature}... [truncated]` };
    });
  }

  shouldHandoff(agentId: string): boolean {
    const action = this.getThreshold(agentId).recommendedAction;
    return action === 'handoff' || action === 'emergency_handoff';
  }

  triggerHandoff(params: {
    agentId: string;
    events: ChimeraEvent[];
    fromAgent: string;
    toAgent: string;
  }): HandoffResult {
    const { agentId, events } = params;

    const { tokensSaved } = this.compactForHandoff(agentId);

    const handoffDocument = this.handoffProtocol.createCompactingHandoff(events);

    const serialized = JSON.stringify(handoffDocument);

    const validation = this.handoffProtocol.validateHandoff(handoffDocument);

    const isValid =
      validation.dataComplete &&
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

  private compactForHandoff(agentId: string): {
    compacted: string;
    tokensSaved: number;
  } {
    const state = this.agents.get(agentId);
    if (!state) return { compacted: '', tokensSaved: 0 };

    const masks = this.maskedObservations.get(agentId) ?? [];
    const tokensSaved = masks.reduce((sum, m) => sum + m.tokensSaved, 0);

    const fillPercent = (state.tokens / state.maxTokens * 100).toFixed(1);
    const compacted = `[Compacted context — ${fillPercent}% used, ${masks.length} observations masked]`;

    return { compacted, tokensSaved };
  }
}
