import { FallbackChain } from '@chimera/providers';
import type { ModelProvider, Message, FallbackEvent } from '@chimera/providers';
import type { LLMProvider, ToolCall } from '@chimera/core';

/**
 * Wraps a FallbackChain as an LLMProvider so the orchestrator can use it
 * transparently. When the primary provider hits a rate limit or goes down,
 * the FallbackChain automatically retries on the next provider in the list.
 *
 * The `adaptProvider` bridge (messages + tool calls) is the same one used
 * by `cli-router.ts` for single providers — we just delegate to the chain
 * instead of a single ModelProvider.
 */
export function createFallbackProvider(
  providers: ModelProvider[],
  onFallback?: (event: FallbackEvent) => void,
): LLMProvider {
  const chain = new FallbackChain(providers);

  if (onFallback) {
    chain.on('fallback', onFallback);
    chain.on('circuit_open', onFallback);
    chain.on('circuit_closed', onFallback);
  }

  return {
    async complete(
      messages: Array<{ role: string; content: string }>,
      options?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: 'text' | 'json_object';
        tools?: Array<{
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        }>;
        signal?: AbortSignal;
        cacheControl?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
      },
    ) {
      const mappedMessages: Message[] = messages.map((m) => {
        const extra = m as unknown as Record<string, unknown>;
        const msg: Message = {
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: m.content,
        };
        if (m.role === 'tool') {
          if (typeof extra.tool_call_id === 'string') {
            msg.toolResultId = extra.tool_call_id;
          } else {
            try {
              const parsed = JSON.parse(m.content);
              if (parsed.toolCallId) {
                msg.toolResultId = parsed.toolCallId;
              }
            } catch { /* content is not JSON */ }
          }
        }
        if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
          msg.toolCalls = (extra.tool_calls as Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>)
            .filter((tc) => tc && tc.function && typeof tc.function.name === 'string')
            .map((tc, i) => ({
              id: tc.id ?? `call_${i}`,
              name: tc.function!.name!,
              arguments: tc.function!.arguments ?? '',
            }));
        }
        return msg;
      });

      const result = await chain.complete(mappedMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat,
        tools: options?.tools,
        cacheControl: options?.cacheControl,
      });

      return {
        content: result.content,
        toolCalls: result.toolCalls?.map((tc: { id: string; name: string; arguments: string }) => ({
          id: tc.id,
          name: tc.name,
          arguments: typeof tc.arguments === 'string'
            ? JSON.parse(tc.arguments)
            : tc.arguments,
        })) as ToolCall[],
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      };
    },
  };
}
