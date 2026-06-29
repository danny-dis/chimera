"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleProvider = void 0;
const capabilities_js_1 = require("../types/capabilities.js");
const errors_js_1 = require("../errors.js");
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_TIMEOUT_MS = 60_000;
const GOOGLE_PRICING = {
    'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10, cacheReadPerMillion: 0.31, cacheWritePerMillion: 4.5 },
    'gemini-2.5-flash': { inputPerMillion: 0.15, outputPerMillion: 0.6, cacheReadPerMillion: 0.04, cacheWritePerMillion: 1 },
    'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
    'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function mapMessages(messages) {
    const result = [];
    for (const msg of messages) {
        if (msg.role === 'system') {
            result.push({
                role: 'user',
                parts: [{ text: `System: ${msg.content}` }],
            });
            result.push({
                role: 'model',
                parts: [{ text: 'Understood.' }],
            });
            continue;
        }
        if (msg.role === 'tool') {
            if (msg.toolResultId) {
                result.push({
                    role: 'user',
                    parts: [{
                            functionResponse: {
                                name: msg.toolResultId,
                                response: { content: msg.content },
                            },
                        }],
                });
            }
            continue;
        }
        const role = msg.role === 'assistant' ? 'model' : msg.role;
        result.push({ role, parts: [{ text: msg.content }] });
        if (msg.toolCalls?.length) {
            result.push({
                role: 'model',
                parts: msg.toolCalls.map((tc) => ({
                    functionCall: { name: tc.name, args: JSON.parse(tc.arguments) },
                })),
            });
        }
    }
    return result;
}
function mapTools(tools) {
    return [{
            functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            })),
        }];
}
function parseCompletionResult(body) {
    const candidates = body.candidates;
    if (!candidates?.length) {
        throw new errors_js_1.ProviderError('No candidates returned from Google');
    }
    const candidate = candidates[0];
    const content = candidate.content;
    const parts = content?.parts;
    let textContent = '';
    const toolCalls = [];
    if (parts) {
        for (const part of parts) {
            if (part.text) {
                textContent += part.text;
            }
            if (part.functionCall) {
                const fc = part.functionCall;
                toolCalls.push({
                    id: fc.name,
                    name: fc.name,
                    arguments: JSON.stringify(fc.args),
                });
            }
        }
    }
    const usageMetadata = body.usageMetadata;
    const tokenUsage = {
        inputTokens: usageMetadata?.promptTokenCount ?? 0,
        outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    };
    return {
        content: textContent,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason: candidate.finishReason ?? 'STOP',
        usage: tokenUsage,
    };
}
function parseStreamChunk(data) {
    const candidates = data.candidates;
    if (!candidates?.length)
        return null;
    const candidate = candidates[0];
    const content = candidate.content;
    const parts = content?.parts;
    let textContent;
    let toolCalls;
    if (parts) {
        for (const part of parts) {
            if (part.text) {
                textContent = (textContent ?? '') + part.text;
            }
            if (part.functionCall) {
                const fc = part.functionCall;
                toolCalls = toolCalls ?? [];
                toolCalls.push({
                    id: fc.name,
                    name: fc.name,
                    arguments: JSON.stringify(fc.args),
                });
            }
        }
    }
    const usageMetadata = data.usageMetadata;
    const tokenUsage = usageMetadata
        ? {
            inputTokens: usageMetadata.promptTokenCount ?? 0,
            outputTokens: usageMetadata.candidatesTokenCount ?? 0,
        }
        : undefined;
    if (!textContent && !toolCalls?.length && !candidate.finishReason) {
        return null;
    }
    return {
        content: textContent,
        toolCalls,
        finishReason: candidate.finishReason ?? undefined,
        usage: tokenUsage,
    };
}
function mapError(status, body, model) {
    const message = typeof body === 'object' && body !== null
        ? body.error?.message
        : undefined;
    const errorText = message ?? `HTTP ${status}`;
    if (status === 429) {
        throw new errors_js_1.RateLimitError(`Google rate limit: ${errorText}`, undefined, model);
    }
    if (status === 403 || status === 402) {
        throw new errors_js_1.QuotaExceededError(`Google quota exceeded: ${errorText}`, model);
    }
    if (status >= 500) {
        throw new errors_js_1.ProviderUnavailableError(`Google unavailable: ${errorText}`, model);
    }
    throw new errors_js_1.ProviderError(`Google error (${status}): ${errorText}`, model, status);
}
class GoogleProvider {
    apiKey;
    model;
    pricing;
    modelInfo;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey;
        // Strip provider prefix (e.g., "google/gemma-4-31b-it" → "gemma-4-31b-it")
        this.model = config.model.replace(/^(google|gemini)\//, '');
        this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const knownPricing = GOOGLE_PRICING[config.model];
        this.pricing = config.options?.pricing ?? knownPricing ?? { inputPerMillion: 0, outputPerMillion: 0 };
        const contextWindows = {
            'gemini-2.5-pro': 1_000_000,
            'gemini-2.5-flash': 1_000_000,
            'gemini-2.0-flash': 1_000_000,
            'gemini-1.5-pro': 2_000_000,
            'gemini-1.5-flash': 1_000_000,
        };
        const maxOutputs = {
            'gemini-2.5-pro': 65_536,
            'gemini-2.5-flash': 65_536,
            'gemini-2.0-flash': 8_192,
            'gemini-1.5-pro': 8_192,
            'gemini-1.5-flash': 8_192,
        };
        this.modelInfo = {
            id: config.model,
            name: config.model,
            provider: 'google',
            contextWindow: config.options?.modelInfo?.contextWindow ?? contextWindows[config.model] ?? 1_000_000,
            maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? maxOutputs[config.model] ?? 8_192,
            created: config.options?.modelInfo?.created ?? new Date(),
            ...config.options?.modelInfo,
        };
    }
    async complete(prompt, options) {
        const body = {
            contents: mapMessages(prompt),
            generationConfig: {},
        };
        const genConfig = body.generationConfig;
        if (options?.temperature !== undefined)
            genConfig.temperature = options.temperature;
        if (options?.topP !== undefined)
            genConfig.topP = options.topP;
        if (options?.maxTokens !== undefined)
            genConfig.maxOutputTokens = options.maxTokens;
        if (options?.stopSequences?.length)
            genConfig.stopSequences = options.stopSequences;
        if (options?.responseFormat === 'json_object') {
            genConfig.responseMimeType = 'application/json';
        }
        if (options?.tools?.length) {
            body.tools = mapTools(options.tools);
        }
        const response = await this.fetchJson(`/v1beta/models/${this.model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        const body = {
            contents: mapMessages(prompt),
            generationConfig: {},
        };
        const genConfig = body.generationConfig;
        if (options?.temperature !== undefined)
            genConfig.temperature = options.temperature;
        if (options?.topP !== undefined)
            genConfig.topP = options.topP;
        if (options?.maxTokens !== undefined)
            genConfig.maxOutputTokens = options.maxTokens;
        if (options?.stopSequences?.length)
            genConfig.stopSequences = options.stopSequences;
        if (options?.tools?.length) {
            body.tools = mapTools(options.tools);
        }
        const response = await this.fetchJson(`/v1beta/models/${this.model}:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
                    if (!trimmed.startsWith('data: '))
                        continue;
                    const dataStr = trimmed.slice(6);
                    try {
                        const parsed = JSON.parse(dataStr);
                        const chunk = parseStreamChunk(parsed);
                        if (chunk)
                            yield chunk;
                    }
                    catch {
                        // Skip malformed SSE data
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
    getCapabilities() {
        return { ...capabilities_js_1.GOOGLE_CAPABILITIES };
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
        return this.model.includes('2.5');
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
        const url = `${GOOGLE_BASE_URL}${path}${path.includes('?') ? '&' : '?'}key=${this.apiKey}`;
        try {
            return await fetch(url, {
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
exports.GoogleProvider = GoogleProvider;
//# sourceMappingURL=google.js.map