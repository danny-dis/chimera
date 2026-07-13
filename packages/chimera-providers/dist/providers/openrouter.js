"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterProvider = void 0;
const capabilities_js_1 = require("../types/capabilities.js");
const errors_js_1 = require("../errors.js");
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function mapMessages(messages) {
    return messages.map((msg) => {
        const base = { role: msg.role, content: msg.content };
        if (msg.role === 'assistant' && msg.toolCalls?.length) {
            return {
                ...base,
                tool_calls: msg.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.arguments },
                })),
            };
        }
        if (msg.role === 'tool') {
            return { ...base, tool_call_id: msg.toolResultId };
        }
        return base;
    });
}
function mapTools(tools) {
    return tools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}
function mapToolChoice(choice) {
    if (choice === 'auto' || choice === 'required' || choice === 'none') {
        return choice;
    }
    return { type: 'function', function: { name: choice.name } };
}
function parseCompletionResult(body) {
    const choice = body.choices?.[0];
    if (!choice) {
        throw new errors_js_1.ProviderError('No choices returned from OpenRouter');
    }
    const message = choice.message;
    const content = message?.content ?? '';
    let toolCalls;
    const rawToolCalls = message?.tool_calls;
    if (rawToolCalls?.length) {
        toolCalls = rawToolCalls
            .map((tc) => {
            const fn = tc.function;
            if (!fn || typeof fn.name !== 'string')
                return null;
            return {
                id: tc.id ?? '',
                name: fn.name,
                arguments: fn.arguments ?? '',
            };
        })
            .filter((tc) => tc !== null);
        if (toolCalls.length === 0)
            toolCalls = undefined;
    }
    const usage = body.usage;
    const tokenUsage = {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
    };
    return {
        content,
        toolCalls,
        finishReason: choice.finish_reason ?? 'stop',
        usage: tokenUsage,
    };
}
function parseStreamChunk(data) {
    const choice = data.choices?.[0];
    if (!choice)
        return null;
    const delta = choice.delta;
    const content = delta?.content ?? undefined;
    let toolCalls;
    const rawToolCalls = delta?.tool_calls;
    if (rawToolCalls?.length) {
        toolCalls = rawToolCalls.map((tc) => {
            const fn = tc.function;
            return {
                id: (tc.index === 0 ? tc.id : undefined),
                name: fn?.name ?? '',
                arguments: fn?.arguments ?? '',
            };
        });
    }
    const finishReason = choice.finish_reason ?? undefined;
    const usage = data.usage;
    let tokenUsage;
    if (usage) {
        tokenUsage = {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
        };
    }
    if (!content && !toolCalls?.length && !finishReason) {
        return null;
    }
    return { content, toolCalls, finishReason, usage: tokenUsage };
}
function mapError(status, body) {
    const message = typeof body === 'object' && body !== null
        ? body.error?.message
        : undefined;
    const errorText = message ?? `HTTP ${status}`;
    if (status === 429) {
        throw new errors_js_1.RateLimitError(`OpenRouter rate limit: ${errorText}`, undefined, 'openrouter');
    }
    if (status === 402 || status === 403) {
        throw new errors_js_1.QuotaExceededError(`OpenRouter quota exceeded: ${errorText}`, 'openrouter');
    }
    if (status >= 500) {
        throw new errors_js_1.ProviderUnavailableError(`OpenRouter unavailable: ${errorText}`, 'openrouter');
    }
    throw new errors_js_1.ProviderError(`OpenRouter error (${status}): ${errorText}`, 'openrouter', status);
}
/**
 * OpenRouter provider — routes requests to 200+ models via a single API key.
 * Supports Claude, GPT, Gemini, Llama, Mistral, and more.
 *
 * @see https://openrouter.ai/docs
 */
class OpenRouterProvider {
    apiKey;
    model;
    pricing;
    modelInfo;
    timeoutMs;
    headers;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.pricing = config.options?.pricing ?? { inputPerMillion: 0, outputPerMillion: 0 };
        this.modelInfo = {
            id: config.model,
            name: config.model,
            provider: 'openrouter',
            contextWindow: config.options?.modelInfo?.contextWindow ?? 128_000,
            maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? 4_096,
            created: config.options?.modelInfo?.created ?? new Date(),
            ...config.options?.modelInfo,
        };
        this.headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': config.options?.httpReferer ?? 'https://github.com/danny-dis/chimera',
            'X-Title': config.options?.title ?? 'Chimera',
        };
    }
    async complete(prompt, options) {
        const body = {
            model: this.model,
            messages: mapMessages(prompt),
        };
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.maxTokens !== undefined)
            body.max_tokens = options.maxTokens;
        if (options?.stopSequences?.length)
            body.stop = options.stopSequences;
        if (options?.tools?.length)
            body.tools = mapTools(options.tools);
        if (options?.toolChoice)
            body.tool_choice = mapToolChoice(options.toolChoice);
        if (options?.responseFormat) {
            body.response_format = { type: options.responseFormat };
        }
        const response = await this.fetchJson('/chat/completions', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody);
        }
        const json = (await response.json());
        return parseCompletionResult(json);
    }
    async *stream(prompt, options) {
        const body = {
            model: this.model,
            messages: mapMessages(prompt),
            stream: true,
            stream_options: { include_usage: true },
        };
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.maxTokens !== undefined)
            body.max_tokens = options.maxTokens;
        if (options?.stopSequences?.length)
            body.stop = options.stopSequences;
        if (options?.tools?.length)
            body.tools = mapTools(options.tools);
        if (options?.toolChoice)
            body.tool_choice = mapToolChoice(options.toolChoice);
        if (options?.responseFormat) {
            body.response_format = { type: options.responseFormat };
        }
        const response = await this.fetchJson('/chat/completions', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody);
        }
        if (!response.body) {
            throw new errors_js_1.StreamingError('Response body is null', 'openrouter');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: '))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]')
                        return;
                    try {
                        const parsed = JSON.parse(data);
                        const chunk = parseStreamChunk(parsed);
                        if (chunk)
                            yield chunk;
                    }
                    catch {
                        // Skip malformed SSE data lines
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof errors_js_1.ProviderError)
                throw error;
            throw new errors_js_1.StreamingError(error instanceof Error ? error.message : 'Stream read failed', 'openrouter');
        }
        finally {
            reader.releaseLock();
        }
    }
    getModel() {
        return { ...this.modelInfo };
    }
    getContextWindow() {
        return this.modelInfo.contextWindow;
    }
    getMaxOutputTokens() {
        return this.modelInfo.maxOutputTokens;
    }
    getCost(tokens) {
        const inputCost = (tokens.input / 1_000_000) * this.pricing.inputPerMillion;
        const outputCost = (tokens.output / 1_000_000) * this.pricing.outputPerMillion;
        return inputCost + outputCost;
    }
    getPricing() {
        return { ...this.pricing };
    }
    getCapabilities() {
        return { ...capabilities_js_1.OPENROUTER_CAPABILITIES };
    }
    supportsToolCalling() {
        return true;
    }
    supportsStructuredOutput() {
        return true;
    }
    supportsVision() {
        return true;
    }
    supportsReasoning() {
        return this.model.includes('o1') || this.model.includes('o3') || this.model.includes('deepseek');
    }
    countTokens(text) {
        return estimateTokens(text);
    }
    countTokensForMessages(messages) {
        let total = 0;
        for (const msg of messages) {
            total += estimateTokens(msg.content);
            total += 4;
            if (msg.toolCalls?.length) {
                for (const tc of msg.toolCalls) {
                    total += estimateTokens(tc.name + tc.arguments);
                }
            }
        }
        return total;
    }
    async fetchJson(path, init) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(`${OPENROUTER_BASE_URL}${path}`, {
                ...init,
                signal: controller.signal,
            });
        }
        catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new errors_js_1.ProviderUnavailableError('Request timed out', 'openrouter');
            }
            throw new errors_js_1.ProviderUnavailableError(error instanceof Error ? error.message : 'Network request failed', 'openrouter');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
//# sourceMappingURL=openrouter.js.map