import { describe, it, expect, beforeEach } from 'vitest';
import { RelayRacing } from '../relay-racing.js';
import type { ChimeraEvent } from '@chimera/core';

function makeEvent(type: string, overrides: Record<string, unknown> = {}): ChimeraEvent {
  return { type, ...overrides } as unknown as ChimeraEvent;
}

describe('RelayRacing', () => {
  let racing: RelayRacing;

  beforeEach(() => {
    racing = new RelayRacing({ defaultContextWindow: 100_000 });
  });

  describe('constructor', () => {
    it('creates with default context window', () => {
      const r = new RelayRacing();
      const threshold = r.getThreshold('default');
      expect(threshold.tier).toBe('healthy');
      expect(threshold.remainingTokens).toBe(200_000);
    });

    it('creates with custom context window', () => {
      const threshold = racing.getThreshold('default');
      expect(threshold.remainingTokens).toBe(100_000);
    });
  });

  describe('registerAgent / unregisterAgent', () => {
    it('registers a new agent', () => {
      racing.registerAgent('agent-1', 50_000);
      const fill = racing.getAgentFill('agent-1');
      expect(fill).toBe(0);
    });

    it('unregisters an agent', () => {
      racing.registerAgent('agent-1');
      racing.unregisterAgent('agent-1');
      expect(() => racing.getAgentFill('agent-1')).toThrow('Agent agent-1 not registered');
    });
  });

  describe('trackTokens', () => {
    it('updates token count and returns threshold', () => {
      racing.registerAgent('a1', 100_000);
      const threshold = racing.trackTokens('a1', 30_000);
      expect(threshold.remainingTokens).toBe(70_000);
      expect(racing.getAgentFill('a1')).toBeCloseTo(0.3);
    });

    it('clamps tokens to zero', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 10_000);
      racing.trackTokens('a1', -20_000);
      expect(racing.getAgentFill('a1')).toBe(0);
    });

    it('throws for unknown agent', () => {
      expect(() => racing.trackTokens('unknown', 100)).toThrow('not registered');
    });
  });

  describe('getThreshold', () => {
    it('returns healthy for 0-50% fill', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 30_000);
      const t = racing.getThreshold('a1');
      expect(t.tier).toBe('healthy');
      expect(t.recommendedAction).toBe('continue');
    });

    it('returns warning for 50-65% fill', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 55_000);
      const t = racing.getThreshold('a1');
      expect(t.tier).toBe('warning');
      expect(t.recommendedAction).toBe('mask');
    });

    it('returns critical for 65-80% fill', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 70_000);
      const t = racing.getThreshold('a1');
      expect(t.tier).toBe('critical');
      expect(t.recommendedAction).toBe('handoff');
    });

    it('returns emergency for 80%+ fill', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 85_000);
      const t = racing.getThreshold('a1');
      expect(t.tier).toBe('emergency');
      expect(t.recommendedAction).toBe('emergency_handoff');
    });
  });

  describe('maskObservations', () => {
    it('truncates long tool outputs', () => {
      const longOutput = 'x'.repeat(250);
      const messages = [{ role: 'tool', content: longOutput }];
      const masked = racing.maskObservations(messages);
      expect(masked[0].content).toContain('[masked]');
      expect(masked[0].content.length).toBeLessThan(longOutput.length);
    });

    it('does not truncate short tool outputs', () => {
      const messages = [{ role: 'tool', content: 'short output' }];
      const masked = racing.maskObservations(messages);
      expect(masked[0].content).toBe('short output');
    });

    it('leaves non-tool messages untouched', () => {
      const messages = [{ role: 'assistant', content: 'hello' }];
      const masked = racing.maskObservations(messages);
      expect(masked[0].content).toBe('hello');
    });
  });

  describe('maskToolCalls', () => {
    it('truncates long assistant tool calls', () => {
      const longContent = '<tool_use>' + 'x'.repeat(150) + '\n{"arg": "value"}';
      const messages = [{ role: 'assistant', content: longContent }];
      const masked = racing.maskToolCalls(messages);
      expect(masked[0].content).toContain('[truncated]');
    });

    it('does not truncate short tool calls', () => {
      const messages = [{ role: 'assistant', content: '<tool_use>short' }];
      const masked = racing.maskToolCalls(messages);
      expect(masked[0].content).toBe('<tool_use>short');
    });

    it('leaves non-assistant messages untouched', () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const masked = racing.maskToolCalls(messages);
      expect(masked[0].content).toBe('hello');
    });
  });

  describe('shouldHandoff', () => {
    it('returns false when healthy', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 30_000);
      expect(racing.shouldHandoff('a1')).toBe(false);
    });

    it('returns true at critical threshold', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 70_000);
      expect(racing.shouldHandoff('a1')).toBe(true);
    });

    it('returns true at emergency threshold', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 90_000);
      expect(racing.shouldHandoff('a1')).toBe(true);
    });
  });

  describe('triggerHandoff', () => {
    it('creates handoff with validation', () => {
      racing.registerAgent('a1', 100_000);
      racing.trackTokens('a1', 70_000);

      const events = [
        makeEvent('user_request', { text: 'Fix bug', mode: 'code' }),
        makeEvent('final_response', { status: 'done', cost: 0, agentCount: 1 }),
      ];

      const result = racing.triggerHandoff({
        agentId: 'a1',
        events,
        fromAgent: 'a1',
        toAgent: 'a2',
      });

      expect(result.handoffDocument).toBeDefined();
      expect(result.handoffDocument.goal).toBe('Fix bug');
      expect(result.serialized).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(result.isValid).toBeDefined();
      expect(typeof result.tokensSaved).toBe('number');
    });
  });
});
