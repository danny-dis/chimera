"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAICompatibleProvider = void 0;
const errors_js_1 = require("../errors.js");
const DEFAULT_PRICING = {
    inputPerMillion: 0,
    outputPerMillion: 0,
};
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
        throw new errors_js_1.ProviderError('No choices returned from provider');
    }
    const message = choice.message;
    const content = message?.content ?? '';
    let toolCalls;
    const rawToolCalls = message?.tool_calls;
    if (rawToolCalls?.length) {
        toolCalls = rawToolCalls.map((tc) => {
            const fn = tc.function;
            return {
                id: tc.id,
                name: fn.name,
                arguments: fn.arguments,
            };
        });
    }
    const usage = body.usage;
    const tokenUsage = {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
    };
    // OpenAI returns cached-input tokens nested under
    // `usage.prompt_tokens_details.cached_tokens`. We only attach the
    // cache field when the nested object is present so non-OpenAI
    // OpenAI-compatible endpoints (which omit it) stay clean.
    const promptDetails = usage?.prompt_tokens_details;
    if (promptDetails?.cached_tokens !== undefined) {
        tokenUsage.cacheReadTokens = promptDetails.cached_tokens;
    }
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
        // Same nested `prompt_tokens_details.cached_tokens` shape as
        // parseCompletionResult; the `stream_options: { include_usage: true }`
        // request in `stream()` is what populates this object.
        const promptDetails = usage.prompt_tokens_details;
        if (promptDetails?.cached_tokens !== undefined) {
            tokenUsage.cacheReadTokens = promptDetails.cached_tokens;
        }
    }
    if (!content && !toolCalls?.length && !finishReason) {
        return null;
    }
    return { content, toolCalls, finishReason, usage: tokenUsage };
}
function mapError(status, body, provider) {
    const message = typeof body === 'object' && body !== null
        ? body.error?.message
        : undefined;
    const errorText = message ?? `HTTP ${status}`;
    if (status === 429) {
        throw new errors_js_1.RateLimitError(`Rate limit exceeded: ${errorText}`, undefined, provider);
    }
    if (status === 402 || status === 403) {
        throw new errors_js_1.QuotaExceededError(`Quota exceeded: ${errorText}`, provider);
    }
    if (status >= 500) {
        throw new errors_js_1.ProviderUnavailableError(`Provider unavailable: ${errorText}`, provider);
    }
    throw new errors_js_1.ProviderError(`Provider error (${status}): ${errorText}`, provider, status);
}
class OpenAICompatibleProvider {
    baseUrl;
    apiKey;
    model;
    pricing;
    modelInfo;
    headers;
    timeoutMs;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.pricing = config.options?.pricing ?? DEFAULT_PRICING;
        this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const now = new Date();
        this.modelInfo = {
            id: config.model,
            name: config.model,
            provider: new URL(config.baseUrl).hostname,
            contextWindow: config.options?.modelInfo?.contextWindow ?? 128_000,
            maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? 4_096,
            created: config.options?.modelInfo?.created ?? now,
            ...config.options?.modelInfo,
        };
        this.headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...config.options?.headers,
        };
    }
    async complete(prompt, options) {
        const body = {
            model: this.model,
            messages: mapMessages(prompt),
            stream: false,
        };
        // NOTE: `options.cacheControl` is intentionally a no-op for
        // OpenAI-compatible providers. OpenAI automatically caches prompts
        // (prefix caching on matching chat.completions requests), so no
        // explicit marker is required. The field is accepted on the shared
        // CompletionOptions interface so callers can pass it uniformly
        // without branching on provider.
        void options?.cacheControl;
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
        const response = await this.fetchJson('/v1/chat/completions', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody, this.modelInfo.provider);
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
        // NOTE: `options.cacheControl` is intentionally a no-op for
        // OpenAI-compatible providers. OpenAI automatically caches prompts
        // (prefix caching on matching chat.completions requests), so no
        // explicit marker is required. The field is accepted on the shared
        // CompletionOptions interface so callers can pass it uniformly
        // without branching on provider.
        void options?.cacheControl;
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
        const response = await this.fetchStream('/v1/chat/completions', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody, this.modelInfo.provider);
        }
        if (!response.body) {
            throw new errors_js_1.StreamingError('Response body is null', this.modelInfo.provider);
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
            throw new errors_js_1.StreamingError(error instanceof Error ? error.message : 'Stream read failed', this.modelInfo.provider);
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
    supportsToolCalling() {
        return true;
    }
    supportsStructuredOutput() {
        return true;
    }
    supportsVision() {
        return this.modelInfo.id.includes('vision') || this.modelInfo.id.includes('4o');
    }
    supportsReasoning() {
        return this.modelInfo.id.includes('o1') || this.modelInfo.id.includes('o3');
    }
    countTokens(text) {
        return estimateTokens(text);
    }
    countTokensForMessages(messages) {
        let total = 0;
        for (const msg of messages) {
            total += estimateTokens(msg.content);
            total += 4; // per-message overhead
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
            return await fetch(`${this.baseUrl}${path}`, {
                ...init,
                signal: controller.signal,
            });
        }
        catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new errors_js_1.ProviderUnavailableError('Request timed out', this.modelInfo.provider);
            }
            throw new errors_js_1.ProviderUnavailableError(error instanceof Error ? error.message : 'Network request failed', this.modelInfo.provider);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async fetchStream(path, init) {
        return this.fetchJson(path, init);
    }
}
exports.OpenAICompatibleProvider = OpenAICompatibleProvider;
//# sourceMappingURL=openai-compatible.js.map