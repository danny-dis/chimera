"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProvider = void 0;
exports.createDefaultMockProvider = createDefaultMockProvider;
/**
 * A deterministic, offline ModelProvider used as a default when no real
 * API keys are configured. Useful for:
 *
 *   - CI smoke tests
 *   - Local "try it" runs
 *   - Development without burning API credits
 *
 * The MockProvider is intentionally side-effect-free: it does not call the
 * network, does not require any credentials, and produces predictable outputs
 * based on the input messages.
 */
class MockProvider {
    options;
    callCount = 0;
    constructor(options = {}) {
        this.options = {
            model: options.model ?? 'mock-default',
            name: options.name ?? 'Mock Provider',
            provider: options.provider ?? 'mock',
            contextWindow: options.contextWindow ?? 200_000,
            maxOutputTokens: options.maxOutputTokens ?? 8_192,
            pricing: options.pricing ?? { inputPerMillion: 0, outputPerMillion: 0 },
            response: options.response ?? this.defaultResponder,
            toolCalls: options.toolCalls,
            latencyMs: options.latencyMs ?? 0,
            failOnCall: options.failOnCall,
            streamChunks: options.streamChunks ?? true,
        };
    }
    /** Default responder: echo the last user message back in a structured way. */
    defaultResponder = (messages) => {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const userText = lastUser?.content ?? '';
        return [
            'Mock response — no real model is configured.',
            '',
            `Mode: ${this.options.provider}/${this.options.model}`,
            `Last user message: ${userText.slice(0, 500)}`,
            '',
            'To use a real model, set ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY, or run `chimera setup`.',
        ].join('\n');
    };
    async complete(prompt, _options) {
        this.callCount += 1;
        if (this.options.failOnCall && this.callCount === this.options.failOnCall) {
            throw new Error('MockProvider injected failure');
        }
        if (this.options.latencyMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
        }
        const text = typeof this.options.response === 'function'
            ? this.options.response(prompt)
            : this.options.response;
        const usage = {
            inputTokens: this.countTokensForMessages(prompt),
            outputTokens: this.countTokens(text),
        };
        return {
            content: text,
            toolCalls: this.options.toolCalls,
            finishReason: this.options.toolCalls?.length ? 'tool_use' : 'end_turn',
            usage,
        };
    }
    async *stream(prompt, _options) {
        const result = await this.complete(prompt);
        if (this.options.streamChunks) {
            const words = result.content.split(/(\s+)/);
            for (const word of words) {
                if (word.length === 0)
                    continue;
                yield { content: word };
            }
        }
        else {
            yield { content: result.content };
        }
        if (result.toolCalls && result.toolCalls.length > 0) {
            yield { toolCalls: result.toolCalls };
        }
        yield { finishReason: result.finishReason, usage: result.usage };
    }
    getModel() {
        return {
            id: this.options.model,
            name: this.options.name,
            provider: this.options.provider,
            contextWindow: this.options.contextWindow,
            maxOutputTokens: this.options.maxOutputTokens,
        };
    }
    getContextWindow() {
        return this.options.contextWindow;
    }
    getMaxOutputTokens() {
        return this.options.maxOutputTokens;
    }
    getCost(tokens) {
        const inputCost = (tokens.input / 1_000_000) * this.options.pricing.inputPerMillion;
        const outputCost = (tokens.output / 1_000_000) * this.options.pricing.outputPerMillion;
        return inputCost + outputCost;
    }
    getPricing() {
        return { ...this.options.pricing };
    }
    supportsToolCalling() {
        return true;
    }
    supportsStructuredOutput() {
        return true;
    }
    supportsVision() {
        return false;
    }
    supportsReasoning() {
        return false;
    }
    countTokens(text) {
        if (!text)
            return 0;
        // Reasonable approximation: ~3.5 chars/token.
        return Math.ceil(text.length / 3.5);
    }
    countTokensForMessages(messages) {
        let total = 0;
        for (const m of messages) {
            total += this.countTokens(m.content);
            if (m.toolCalls) {
                for (const tc of m.toolCalls) {
                    total += this.countTokens(tc.name) + this.countTokens(tc.arguments);
                }
            }
        }
        return total;
    }
}
exports.MockProvider = MockProvider;
/** Convenience: build a default mock provider for "no keys configured" runs. */
function createDefaultMockProvider() {
    return new MockProvider({
        model: 'mock-default',
        name: 'Chimera Mock Provider',
        provider: 'mock',
        pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    });
}
//# sourceMappingURL=mock.js.map