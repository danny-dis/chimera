"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const errors_js_1 = require("../errors.js");
const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120_000;
const FREE_PRICING = { inputPerMillion: 0, outputPerMillion: 0 };
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function mapMessages(messages) {
    return messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
    }));
}
function parseCompletionResult(body) {
    const content = body.message?.content;
    const totalTokens = body.eval_count;
    const promptTokens = body.prompt_eval_count;
    const outputTokens = totalTokens ?? 0;
    const inputTokens = promptTokens ?? 0;
    return {
        content: content ?? '',
        finishReason: body.done === true ? 'stop' : 'unknown',
        usage: { inputTokens, outputTokens },
    };
}
function parseStreamChunk(data) {
    const content = data.message?.content;
    const done = data.done;
    if (!content && !done)
        return null;
    const outputTokens = data.eval_count;
    const promptTokens = data.prompt_eval_count;
    return {
        content,
        finishReason: done === true ? 'stop' : undefined,
        usage: outputTokens !== undefined || promptTokens !== undefined
            ? {
                inputTokens: promptTokens ?? 0,
                outputTokens: outputTokens ?? 0,
            }
            : undefined,
    };
}
class OllamaProvider {
    baseUrl;
    model;
    modelInfo;
    timeoutMs;
    constructor(config) {
        this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.model = config.model;
        this.timeoutMs = config.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.modelInfo = {
            id: config.model,
            name: config.model,
            provider: 'ollama',
            contextWindow: config.options?.modelInfo?.contextWindow ?? 8_192,
            maxOutputTokens: config.options?.modelInfo?.maxOutputTokens ?? 2_048,
            created: config.options?.modelInfo?.created ?? new Date(),
            ...config.options?.modelInfo,
        };
    }
    async complete(prompt, options) {
        const body = {
            model: this.model,
            messages: mapMessages(prompt),
            stream: false,
        };
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.maxTokens !== undefined)
            body.max_tokens = options.maxTokens;
        if (options?.stopSequences?.length)
            body.stop = options.stopSequences;
        const response = await this.fetchJson('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new errors_js_1.ProviderError(`Ollama error (${response.status}): ${response.statusText}`, this.model, response.status);
        }
        const json = (await response.json());
        return parseCompletionResult(json);
    }
    async *stream(prompt, options) {
        const body = {
            model: this.model,
            messages: mapMessages(prompt),
            stream: true,
        };
        if (options?.temperature !== undefined)
            body.temperature = options.temperature;
        if (options?.topP !== undefined)
            body.top_p = options.topP;
        if (options?.maxTokens !== undefined)
            body.max_tokens = options.maxTokens;
        if (options?.stopSequences?.length)
            body.stop = options.stopSequences;
        const response = await this.fetchJson('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new errors_js_1.ProviderError(`Ollama error (${response.status}): ${response.statusText}`, this.model, response.status);
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
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        const chunk = parseStreamChunk(parsed);
                        if (chunk)
                            yield chunk;
                    }
                    catch {
                        // Skip malformed NDJSON lines
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
    getCost(_tokens) {
        return 0;
    }
    getPricing() {
        return { ...FREE_PRICING };
    }
    supportsToolCalling() {
        return false;
    }
    supportsStructuredOutput() {
        return false;
    }
    supportsVision() {
        return this.model.includes('llava') || this.model.includes('vision');
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
            total += 4;
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
                throw new errors_js_1.ProviderUnavailableError('Request timed out', this.model);
            }
            throw new errors_js_1.ProviderUnavailableError(error instanceof Error ? error.message : 'Network request failed', this.model);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=ollama.js.map