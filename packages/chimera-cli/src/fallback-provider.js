"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFallbackProvider = createFallbackProvider;
const providers_1 = require("@chimera/providers");
/**
 * Wraps a FallbackChain as an LLMProvider so the orchestrator can use it
 * transparently. When the primary provider hits a rate limit or goes down,
 * the FallbackChain automatically retries on the next provider in the list.
 *
 * The `adaptProvider` bridge (messages + tool calls) is the same one used
 * by `cli-router.ts` for single providers — we just delegate to the chain
 * instead of a single ModelProvider.
 */
function createFallbackProvider(providers, onFallback) {
    const chain = new providers_1.FallbackChain(providers);
    if (onFallback) {
        chain.on('fallback', onFallback);
        chain.on('circuit_open', onFallback);
        chain.on('circuit_closed', onFallback);
    }
    return {
        async complete(messages, options) {
            const mappedMessages = messages.map((m) => {
                const extra = m;
                const msg = {
                    role: m.role,
                    content: m.content,
                };
                if (m.role === 'tool') {
                    if (typeof extra.tool_call_id === 'string') {
                        msg.toolResultId = extra.tool_call_id;
                    }
                    else {
                        try {
                            const parsed = JSON.parse(m.content);
                            if (parsed.toolCallId) {
                                msg.toolResultId = parsed.toolCallId;
                            }
                        }
                        catch { /* content is not JSON */ }
                    }
                }
                if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
                    msg.toolCalls = extra.tool_calls.map((tc) => ({
                        id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments,
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
                toolCalls: result.toolCalls?.map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: typeof tc.arguments === 'string'
                        ? JSON.parse(tc.arguments)
                        : tc.arguments,
                })),
                usage: {
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                },
            };
        },
    };
}
//# sourceMappingURL=fallback-provider.js.map