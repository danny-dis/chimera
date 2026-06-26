"use strict";
// Web search error type — surfaced when a provider returns non-2xx.
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchError = void 0;
class WebSearchError extends Error {
    provider;
    status;
    constructor(provider, message, status) {
        super(message);
        this.name = 'WebSearchError';
        this.provider = provider;
        this.status = status;
        // Preserve prototype chain when transpiled to ES5.
        Object.setPrototypeOf(this, WebSearchError.prototype);
    }
}
exports.WebSearchError = WebSearchError;
//# sourceMappingURL=web-errors.js.map