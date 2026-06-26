/**
 * @chimera/providers — contract layer type tests
 *
 * Verifies that the ported MessageChunk discriminated union and
 * ProviderCapabilities tiered-union shape compile under the strict TS
 * config (`strict`, `noUnusedLocals`, `noUnusedParameters`) and behave
 * correctly under discriminated narrowing.
 *
 * Type-only assertions use `expectTypeOf` (vitest 1.x has this via
 * chai-style assertion extension) or `@ts-expect-error` for negative
 * cases. Each test doubles as a compile-time guard.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';

import type {
  MessageChunk,
  MessageTokenUsage,
  ProviderCapabilities,
  SystemPromptPreset,
  SystemPromptInput,
  NativeTool,
  AgentRequestOptions,
  NodeConfig,
  SendQueryOptions,
  IAgentProvider,
} from '../types/provider.js';

describe('MessageChunk', () => {
  it('accepts an assistant chunk with content', () => {
    const chunk: MessageChunk = { type: 'assistant', content: 'hello' };
    expect(chunk.type).toBe('assistant');
    if (chunk.type === 'assistant') {
      expect(chunk.content).toBe('hello');
      expect(chunk.flush).toBeUndefined();
    }
  });

  it('accepts an assistant chunk with the optional flush flag', () => {
    const chunk: MessageChunk = { type: 'assistant', content: 'urgent', flush: true };
    expect(chunk.type).toBe('assistant');
    if (chunk.type === 'assistant') {
      expect(chunk.flush).toBe(true);
    }
  });

  it('accepts a result chunk with isError and errors', () => {
    const chunk: MessageChunk = {
      type: 'result',
      isError: true,
      errors: ['boom', 'kapow'],
      stopReason: 'max_tokens',
    };
    expect(chunk.type).toBe('result');
    if (chunk.type === 'result') {
      expect(chunk.isError).toBe(true);
      expect(chunk.errors).toEqual(['boom', 'kapow']);
    }
  });

  it('accepts a result chunk with token usage and cost', () => {
    const usage: MessageTokenUsage = { input: 100, output: 50, total: 150, cost: 0.0042 };
    const chunk: MessageChunk = { type: 'result', tokens: usage, cost: 0.0042 };
    if (chunk.type === 'result') {
      expect(chunk.tokens?.input).toBe(100);
      expect(chunk.tokens?.output).toBe(50);
    }
  });

  it('accepts a tool chunk with a stable toolCallId', () => {
    const chunk: MessageChunk = {
      type: 'tool',
      toolName: 'read_file',
      toolInput: { path: '/tmp/x' },
      toolCallId: 'call_abc123',
    };
    expect(chunk.type).toBe('tool');
    if (chunk.type === 'tool') {
      expect(chunk.toolCallId).toBe('call_abc123');
      expect(chunk.toolName).toBe('read_file');
    }
  });

  it('accepts a tool_result chunk with a matching toolCallId', () => {
    const callId = 'call_abc123';
    const toolChunk: MessageChunk = {
      type: 'tool',
      toolName: 'read_file',
      toolCallId: callId,
    };
    const resultChunk: MessageChunk = {
      type: 'tool_result',
      toolName: 'read_file',
      toolOutput: 'file contents',
      toolCallId: callId,
    };
    // Structural compatibility: same id flows through both chunks.
    if (toolChunk.type === 'tool' && resultChunk.type === 'tool_result') {
      expect(toolChunk.toolCallId).toBe(resultChunk.toolCallId);
    }
  });

  it('accepts a rate_limit chunk with arbitrary rate-limit info', () => {
    const chunk: MessageChunk = {
      type: 'rate_limit',
      rateLimitInfo: { retryAfterMs: 30_000, scope: 'organization' },
    };
    expect(chunk.type).toBe('rate_limit');
    if (chunk.type === 'rate_limit') {
      expect(chunk.rateLimitInfo.retryAfterMs).toBe(30_000);
    }
  });

  it('narrows discriminated unions correctly', () => {
    const chunks: MessageChunk[] = [
      { type: 'assistant', content: 'a' },
      { type: 'system', content: 'b' },
      { type: 'thinking', content: 'c' },
      { type: 'result' },
      { type: 'rate_limit', rateLimitInfo: {} },
      { type: 'tool', toolName: 'x' },
      { type: 'tool_result', toolName: 'x', toolOutput: 'y' },
    ];

    const seen = new Set<MessageChunk['type']>();
    for (const chunk of chunks) {
      seen.add(chunk.type);
      switch (chunk.type) {
        case 'assistant':
          // @ts-expect-error — `tokens` is result-only
          chunk.tokens;
          expect(typeof chunk.content).toBe('string');
          break;
        case 'system':
          expect(typeof chunk.content).toBe('string');
          break;
        case 'thinking':
          expect(typeof chunk.content).toBe('string');
          break;
        case 'result':
          // `tokens` is the result-only field.
          expectTypeOf(chunk).toHaveProperty('tokens');
          break;
        case 'rate_limit':
          expect(chunk.rateLimitInfo).toBeDefined();
          break;
        case 'tool':
          expect(typeof chunk.toolName).toBe('string');
          break;
        case 'tool_result':
          expect(typeof chunk.toolOutput).toBe('string');
          break;
      }
    }

    // Exhaustive over the 7 contract variants (workflow_dispatch deliberately omitted for week-2).
    expect(seen.size).toBe(7);
  });
});

describe('ProviderCapabilities', () => {
  it('accepts structuredOutput: "enforced"', () => {
    const caps: ProviderCapabilities = {
      sessionResume: true,
      mcp: true,
      hooks: true,
      skills: true,
      agents: true,
      toolRestrictions: true,
      structuredOutput: 'enforced',
      envInjection: true,
      costControl: true,
      effortControl: true,
      thinkingControl: true,
      fallbackModel: true,
      sandbox: true,
      nativeTools: true,
    };
    expect(caps.structuredOutput).toBe('enforced');
  });

  it('accepts structuredOutput: "best-effort"', () => {
    const caps: ProviderCapabilities = {
      sessionResume: false,
      mcp: false,
      hooks: false,
      skills: false,
      agents: false,
      toolRestrictions: false,
      structuredOutput: 'best-effort',
      envInjection: false,
      costControl: false,
      effortControl: false,
      thinkingControl: false,
      fallbackModel: false,
      sandbox: false,
      nativeTools: false,
    };
    expect(caps.structuredOutput).toBe('best-effort');
  });

  it('accepts structuredOutput: false', () => {
    const caps: ProviderCapabilities = {
      sessionResume: false,
      mcp: false,
      hooks: false,
      skills: false,
      agents: false,
      toolRestrictions: false,
      structuredOutput: false,
      envInjection: false,
      costControl: false,
      effortControl: false,
      thinkingControl: false,
      fallbackModel: false,
      sandbox: false,
      nativeTools: false,
    };
    expect(caps.structuredOutput).toBe(false);
  });

  it('rejects invalid string for structuredOutput', () => {
    const caps: ProviderCapabilities = {
      sessionResume: false,
      mcp: false,
      hooks: false,
      skills: false,
      agents: false,
      toolRestrictions: false,
      // @ts-expect-error — 'sometimes' is not a valid structuredOutput tier
      structuredOutput: 'sometimes',
      envInjection: false,
      costControl: false,
      effortControl: false,
      thinkingControl: false,
      fallbackModel: false,
      sandbox: false,
      nativeTools: false,
    };
    expect(caps).toBeDefined();
  });
});

describe('Supporting contract types', () => {
  it('SystemPromptInput accepts string, string[], and SystemPromptPreset', () => {
    const a: SystemPromptInput = 'plain';
    const b: SystemPromptInput = ['one', 'two'];
    const c: SystemPromptInput = { type: 'preset', preset: 'claude_code', append: 'extra' };
    expect(typeof a).toBe('string');
    expect(Array.isArray(b)).toBe(true);
    expect((c as SystemPromptPreset).preset).toBe('claude_code');
  });

  it('NativeTool declares name, description, inputSchema, handler', () => {
    const tool: NativeTool = {
      name: 'manage_run',
      description: 'manage workflow runs',
      inputSchema: { type: 'object', properties: {} },
      handler: async (_input) => 'ok',
    };
    expect(tool.name).toBe('manage_run');
    // handler is async, so the resolved value is a string.
    void tool.handler({}).then((out) => {
      expect(out).toBe('ok');
    });
  });

  it('AgentRequestOptions accepts the canonical fields', () => {
    const opts: AgentRequestOptions = {
      model: 'claude-sonnet-4-20250514',
      abortSignal: new AbortController().signal,
      systemPrompt: 'be terse',
      maxBudgetUsd: 0.5,
      fallbackModel: 'haiku',
      persistSession: true,
    };
    expect(opts.model).toContain('claude');
  });

  it('NodeConfig accepts the slimmed node shape', () => {
    const node: NodeConfig = {
      nodeId: 'step-1',
      mcp: 'mcp.json',
      skills: ['plannotator'],
      allowed_tools: ['read_file'],
      effort: 'high',
      output_format: { type: 'json_schema', schema: {} },
      maxBudgetUsd: 0.25,
    };
    expect(node.nodeId).toBe('step-1');
  });

  it('SendQueryOptions extends AgentRequestOptions with nodeConfig/assistantConfig', () => {
    const opts: SendQueryOptions = {
      model: 'haiku',
      nodeConfig: { nodeId: 'a' },
      assistantConfig: { extra: 1 },
    };
    expect(opts.nodeConfig?.nodeId).toBe('a');
  });

  it('IAgentProvider declares sendQuery, getType, getCapabilities', () => {
    // Type-only assertion — compiles a minimal impl and confirms the
    // shape is satisfied.
    const impl: IAgentProvider = {
      sendQuery: async function* () {
        yield { type: 'assistant', content: 'hi' } as MessageChunk;
      },
      getType: () => 'mock',
      getCapabilities: () => ({
        sessionResume: false,
        mcp: false,
        hooks: false,
        skills: false,
        agents: false,
        toolRestrictions: false,
        structuredOutput: false,
        envInjection: false,
        costControl: false,
        effortControl: false,
        thinkingControl: false,
        fallbackModel: false,
        sandbox: false,
        nativeTools: false,
      }),
    };
    expect(impl.getType()).toBe('mock');
    expect(impl.getCapabilities().structuredOutput).toBe(false);
  });
});
