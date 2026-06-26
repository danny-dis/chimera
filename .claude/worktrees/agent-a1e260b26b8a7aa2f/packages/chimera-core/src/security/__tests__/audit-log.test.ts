import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLog } from '../audit-log.js';

describe('AuditLog', () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog();
  });

  it('logs and queries entries', () => {
    log.logToolCall({
      sessionId: 'session-1',
      tool: 'read_file',
      paramsHash: 'abc123',
      userApproved: true,
      tokenCost: 100,
    });

    log.logLLMCall({
      sessionId: 'session-1',
      model: 'claude-sonnet-4',
      inputTokens: 500,
      outputTokens: 200,
      tokenCost: 50,
    });

    expect(log.size()).toBe(2);

    const toolCalls = log.query({ actionType: 'tool_call' });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].tool).toBe('read_file');

    const llmCalls = log.query({ actionType: 'llm_call' });
    expect(llmCalls).toHaveLength(1);
    expect(llmCalls[0].details.model).toBe('claude-sonnet-4');
  });

  it('logs security events', () => {
    log.logSecurityEvent({
      sessionId: 'session-1',
      event: 'prompt_injection_detected',
      confidence: 0.95,
      flags: ['instruction_override', 'role_hijack'],
    });

    const events = log.query({ actionType: 'security_event' });
    expect(events).toHaveLength(1);
    expect(events[0].details.confidence).toBe(0.95);
  });

  it('filters by session', () => {
    log.logToolCall({ sessionId: 's1', tool: 'a', paramsHash: 'x', userApproved: true, tokenCost: 0 });
    log.logToolCall({ sessionId: 's2', tool: 'b', paramsHash: 'y', userApproved: true, tokenCost: 0 });

    expect(log.query({ sessionId: 's1' })).toHaveLength(1);
    expect(log.query({ sessionId: 's2' })).toHaveLength(1);
  });

  it('filters by time range', () => {
    const now = Date.now();

    log.log({ sessionId: 's1', actionType: 'tool_call', userApproved: true, tokenCost: 0, details: {} });
    log.log({ sessionId: 's1', actionType: 'tool_call', userApproved: true, tokenCost: 0, details: {} });

    const recent = log.query({ since: now - 1000 });
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });

  it('calculates session cost', () => {
    log.logToolCall({ sessionId: 's1', tool: 'a', paramsHash: 'x', userApproved: true, tokenCost: 100 });
    log.logToolCall({ sessionId: 's1', tool: 'b', paramsHash: 'y', userApproved: true, tokenCost: 200 });
    log.logToolCall({ sessionId: 's2', tool: 'c', paramsHash: 'z', userApproved: true, tokenCost: 50 });

    expect(log.sessionCost('s1')).toBe(300);
    expect(log.sessionCost('s2')).toBe(50);
  });

  it('exports as JSON', () => {
    log.logToolCall({ sessionId: 's1', tool: 'a', paramsHash: 'x', userApproved: true, tokenCost: 0 });
    const exported = log.export();
    const parsed = JSON.parse(exported);
    expect(parsed).toHaveLength(1);
  });

  it('respects query limit', () => {
    for (let i = 0; i < 10; i++) {
      log.log({ sessionId: 's1', actionType: 'tool_call', userApproved: true, tokenCost: 0, details: {} });
    }

    expect(log.query({ limit: 3 })).toHaveLength(3);
  });
});
