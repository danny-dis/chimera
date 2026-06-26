"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackChain = void 0;
const errors_js_1 = require("./errors.js");
const CIRCUIT_BREAKER_THRESHOLD = 3;
function isRetryableError(error) {
    if (error instanceof errors_js_1.RateLimitError)
        return true;
    if (error instanceof errors_js_1.ProviderUnavailableError)
        return true;
    if (error instanceof errors_js_1.ProviderError) {
        return (error.statusCode ?? 0) >= 500;
    }
    return false;
}
class FallbackChain {
    providers;
    failureCounts = new Map();
    listeners = [];
    constructor(providers) {
        if (providers.length === 0) {
            throw new errors_js_1.ProviderError('FallbackChain requires at least one provider');
        }
        this.providers = providers;
    }
    on(_event, listener) {
        this.listeners.push(listener);
    }
    off(_listener) {
        const index = this.listeners.indexOf(_listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }
    async complete(prompt, options) {
        const available = this.getAvailableProviders();
        for (let i = 0; i < available.length; i++) {
            const provider = available[i];
            const name = provider.getModel().id;
            try {
                const result = await provider.complete(prompt, options);
                this.resetFailures(name);
                return result;
            }
            catch (error) {
                if (!isRetryableError(error)) {
                    throw error;
                }
                this.recordFailure(name);
                const nextProvider = available[i + 1];
                if (nextProvider) {
                    const nextName = nextProvider.getModel().id;
                    this.emit({
                        type: 'fallback',
                        from: name,
                        to: nextName,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            }
        }
        throw new errors_js_1.ProviderUnavailableError(`All ${available.length} providers in fallback chain failed`);
    }
    async *stream(prompt, options) {
        const available = this.getAvailableProviders();
        for (let i = 0; i < available.length; i++) {
            const provider = available[i];
            const name = provider.getModel().id;
            try {
                let yielded = false;
                for await (const chunk of provider.stream(prompt, options)) {
                    yielded = true;
                    yield chunk;
                }
                if (yielded) {
                    this.resetFailures(name);
                }
                return;
            }
            catch (error) {
                if (!isRetryableError(error)) {
                    throw error;
                }
                this.recordFailure(name);
                const nextProvider = available[i + 1];
                if (nextProvider) {
                    const nextName = nextProvider.getModel().id;
                    this.emit({
                        type: 'fallback',
                        from: name,
                        to: nextName,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            }
        }
        throw new errors_js_1.ProviderUnavailableError(`All ${available.length} providers in fallback chain failed`);
    }
    getAvailableProviders() {
        return this.providers.filter((p) => {
            const name = p.getModel().id;
            const failures = this.failureCounts.get(name) ?? 0;
            return failures < CIRCUIT_BREAKER_THRESHOLD;
        });
    }
    recordFailure(name) {
        const count = (this.failureCounts.get(name) ?? 0) + 1;
        this.failureCounts.set(name, count);
        if (count === CIRCUIT_BREAKER_THRESHOLD) {
            this.emit({ type: 'circuit_open', provider: name, failures: count });
        }
    }
    resetFailures(name) {
        const previous = this.failureCounts.get(name) ?? 0;
        if (previous > 0) {
            this.failureCounts.set(name, 0);
            this.emit({ type: 'circuit_closed', provider: name });
        }
    }
    emit(event) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
exports.FallbackChain = FallbackChain;
//# sourceMappingURL=fallback-chain.js.map