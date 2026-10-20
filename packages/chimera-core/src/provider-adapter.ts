import type { Message, ModelProvider } from '@chimera/providers';
import type { LLMProvider } from './session-orchestrator.js';

type ProviderBridge = Pick<ModelProvider, 'complete'> & Partial<Pick<ModelProvider, 'getCost' | 'getPricing' | 'getModel'>>;

export function getProviderModelId(provider: LLMProvider): string | undefined {
  const model = provider.getModel?.();
  return provider.getModelId?.() ?? model?.id ?? model?.model ?? model?.name;
}

function parseArguments(value: unknown): Record<string, unknown> {
  let parsed = value;
  for (let depth = 0; depth < 2 && typeof parsed === 'string'; depth++) {
    try { parsed = JSON.parse(parsed); } catch { throw new Error('Invalid tool-call arguments'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid tool-call arguments');
  }
  return parsed as Record<string, unknown>;
}

export function adaptProvider(provider: ProviderBridge): LLMProvider {
  return {
    getModel: provider.getModel?.bind(provider),
    getCost: provider.getCost?.bind(provider),
    getPricing: provider.getPricing?.bind(provider),
    async complete(messages, options) {
      const mapped = messages.map((message): Message => {
        const extra = message as unknown as Record<string, unknown>;
        const out: Message = { role: message.role as Message['role'], content: message.content };
        if (message.role === 'tool') {
          let body: Record<string, unknown> | undefined;
          try { body = JSON.parse(message.content); } catch { /* Non-JSON tool output is valid. */ }
          const id = extra.toolResultId ?? extra.tool_call_id ?? body?.toolCallId;
          if (typeof id === 'string') out.toolResultId = id;
          const name = extra.toolName ?? extra.name ?? body?.toolName;
          if (typeof name === 'string') out.toolName = name;
        }
        const calls = extra.toolCalls ?? extra.tool_calls;
        if (message.role === 'assistant' && Array.isArray(calls)) {
          out.toolCalls = calls.map((call) => {
            const fn = call.function ?? call;
            if (typeof call.id !== 'string' || typeof fn.name !== 'string') throw new Error('Invalid assistant tool call');
            return { id: call.id, name: fn.name, arguments: JSON.stringify(parseArguments(fn.arguments)) };
          });
        }
        return out;
      });
      const result = await provider.complete(mapped, options);
      return {
        content: result.content,
        usage: result.usage,
        toolCalls: result.toolCalls?.map((call) => ({
          id: call.id, name: call.name, arguments: parseArguments(call.arguments),
        })),
      };
    },
  };
}
