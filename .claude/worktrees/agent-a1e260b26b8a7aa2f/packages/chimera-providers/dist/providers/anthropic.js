"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const errors_js_1 = require("../errors.js");
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 60_000;
const ANTHROPIC_PRICING = {
    'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
    'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
    'claude-3-5-sonnet-20241022': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
    'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
    'claude-3-opus-20240229': { inputPerMillion: 15, outputPerMillion: 75 },
};
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}
function mapMessages(messages) {
    const result = [];
    for (const msg of messages) {
        if (msg.role === 'system') {
            result.push({ role: 'system', content: msg.content });
            continue;
        }
        if (msg.role === 'assistant' && msg.toolCalls?.length) {
            const contentBlocks = [];
            if (msg.content) {
                contentBlocks.push({ type: 'text', text: msg.content });
            }
            for (const tc of msg.toolCalls) {
                contentBlocks.push({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: JSON.parse(tc.arguments),
                });
            }
            result.push({ role: 'assistant', content: contentBlocks });
            continue;
        }
        if (msg.role === 'tool') {
            result.push({
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: msg.toolResultId,
                        content: msg.content,
                    },
                ],
            });
            continue;
        }
        result.push({ role: msg.role, content: msg.content });
    }
    return result;
}
function mapTools(tools) {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
    }));
}
function parseCompletionResult(body) {
    let content = '';
    const toolCalls = [];
    const contentBlocks = body.content;
    if (contentBlocks) {
        for (const block of contentBlocks) {
            if (block.type === 'text') {
                content += block.text;
            }
            else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: JSON.stringify(block.input),
                });
            }
        }
    }
    const usage = body.usage;
    const tokenUsage = {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
    };
    return {
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason: body.stop_reason ?? 'end_turn',
        usage: tokenUsage,
    };
}
function parseStreamChunk(data, type) {
    if (type === 'content_block_delta') {
        const delta = data.delta;
        if (delta?.type === 'text_delta') {
            return { content: delta.text };
        }
        if (delta?.type === 'input_json_delta') {
            return { toolCalls: [{ id: '', name: '', arguments: delta.partial_json ?? '' }] };
        }
    }
    if (type === 'message_delta') {
        const delta = data.delta;
        const usage = data.usage;
        return {
            finishReason: delta?.stop_reason ?? undefined,
            usage: usage
                ? {
                    inputTokens: 0,
                    outputTokens: usage.output_tokens ?? 0,
                }
                : undefined,
        };
    }
    return null;
}
function mapError(status, body, model) {
    const message = typeof body === 'object' && body !== null
        ? body.error?.message
        : undefined;
    const errorText = message ?? `HTTP ${status}`;
    if (status === 429) {
        throw new errors_js_1.RateLimitError(`Anthropic rate limit: ${errorText}`, undefined, model);
    }
    if (status === 402) {
        throw new errors_js_1.QuotaExceededError(`Anthropic quota exceeded: ${errorText}`, model);
    }
    if (status >= 500) {
        throw new errors_js_1.ProviderUnavailableError(`Anthropic unavailable: ${errorText}`, model);
    }
    throw new errors_js_1.ProviderError(`Anthropic error (${status}): ${errorText}`, model, status);
}
class AnthropicProvider {
    apiKey;
    model;
    pricing;
    modelInfo;
    apiVersion;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.apiVersion = config.options?.apiVersion ?? ANTHROPIC_API_VERSION;
        this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const knownPricing = ANTHROPIC_PRICING[config.model];
        this.pricing = config.options?.pricing ?? knownPricing ?? { inputPerMillion: 0, outputPerMillion: 0 };
        const contextWindows = {
            'claude-sonnet-4-20250514': 200_000,
            'claude-opus-4-20250514': 200_000,
            'claude-3-5-sonnet-20241022': 200_000,
            'claude-3-5-haiku-20241022': 200_000,
            'claude-3-opus-20240229': 200_000,
        };
        const maxOutputs = {
            'claude-sonnet-4-20250514': 8_192,
            'claude-opus-4-20250514': 8_192,
            'claude-3-5-sonnet-20241022': 8_192,
            'claude-3-5-haiku-20241022': 8_192,
            'claude-3-opus-20240229': 4_096,
        };
        this.modelInfo = {
            id: config.model,
            name: config.model,
            provider: 'anthropic',
            contextWindow: config.options?.modelInfo?.contextWindow ?? contextWindows[config.model] ?? 200_000,
            maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? maxOutputs[config.model] ?? 8_192,
            created: config.options?.modelInfo?.created ?? new Date(),
            ...config.options?.modelInfo,
        };
    }
    async complete(prompt, options) {
        const systemMessage = prompt.find((m) => m.role === 'system');
        const nonSystemMessages = prompt.filter((m) => m.role !== 'system');
        const body = {
            model: this.model,
            messages: mapMessages(nonSystemMessages),
            max_tokens: options?.maxTokens ?? this.modelInfo.maxOutputTokens,
        };
        if (systemMessage) {
            body.system = systemMessage.content;
        }
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.stopSequences?.length)
            body.stop_sequences = options.stopSequences;
        if (options?.tools?.length)
            body.tools = mapTools(options.tools);
        if (options?.toolChoice) {
            body.tool_choice = options.toolChoice === 'required'
                ? { type: 'any' }
                : options.toolChoice === 'none'
                    ? { type: 'auto' }
                    : { type: 'auto' };
        }
        const response = await this.fetch('/v1/messages', {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody, this.model);
        }
        const json = (await response.json());
        return parseCompletionResult(json);
    }
    async *stream(prompt, options) {
        const systemMessage = prompt.find((m) => m.role === 'system');
        const nonSystemMessages = prompt.filter((m) => m.role !== 'system');
        const body = {
            model: this.model,
            messages: mapMessages(nonSystemMessages),
            max_tokens: options?.maxTokens ?? this.modelInfo.maxOutputTokens,
            stream: true,
        };
        if (systemMessage) {
            body.system = systemMessage.content;
        }
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.stopSequences?.length)
            body.stop_sequences = options.stopSequences;
        if (options?.tools?.length)
            body.tools = mapTools(options.tools);
        const response = await this.fetch('/v1/messages', {
            method: 'POST',
            headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            mapError(response.status, errorBody, this.model);
        }
        if (!response.body) {
            throw new errors_js_1.StreamingError('Response body is null', this.model);
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
                    if (!trimmed.startsWith('event: ') && !trimmed.startsWith('data: '))
                        continue;
                    if (trimmed.startsWith('event: ')) {
                        const eventType = trimmed.slice(7);
                        const dataLine = lines.shift()?.trim();
                        if (!dataLine?.startsWith('data: '))
                            continue;
                        const dataStr = dataLine.slice(6);
                        if (dataStr === '[DONE]')
                            return;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const chunk = parseStreamChunk(parsed, eventType);
                            if (chunk)
                                yield chunk;
                        }
                        catch {
                            // Skip malformed SSE data
                        }
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof errors_js_1.ProviderError)
                throw error;
            throw new errors_js_1.StreamingError(error instanceof Error ? error.message : 'Stream read failed', this.model);
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
        return this.model.includes('sonnet') || this.model.includes('opus');
    }
    supportsReasoning() {
        return false;
    }
    countTokens(text) {
        return estimateTokens(text);
    }
    countTokensForMessages(messages) {
        let total = 0;
        for (const msg of messages) {
            total += estimateTokens(msg.content);
            total += 3;
            if (msg.toolCalls?.length) {
                for (const tc of msg.toolCalls) {
                    total += estimateTokens(tc.name + tc.arguments);
                }
            }
        }
        return total;
    }
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
        };
    }
    async fetch(path, init) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await fetch(`${ANTHROPIC_BASE_URL}${path}`, {
                ...init,
                signal: controller.signal,
            });
        }
        catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new errors_js_1.ProviderUnavailableError('Request timed out', this.model);
            }
            throw new errors_js_1.ProviderUnavailableError(error instanceof Error ? error.message : 'Network request failed', this.model);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=anthropic.js.map