"use strict";
/**
 * Web search providers for chimera.
 * Export all providers and the provider manager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchProviderManager = exports.BraveSearchProvider = exports.SearxngProvider = exports.DuckDuckGoProvider = void 0;
var duckduckgo_js_1 = require("./duckduckgo.js");
Object.defineProperty(exports, "DuckDuckGoProvider", { enumerable: true, get: function () { return duckduckgo_js_1.DuckDuckGoProvider; } });
var searxng_js_1 = require("./searxng.js");
Object.defineProperty(exports, "SearxngProvider", { enumerable: true, get: function () { return searxng_js_1.SearxngProvider; } });
var brave_js_1 = require("./brave.js");
Object.defineProperty(exports, "BraveSearchProvider", { enumerable: true, get: function () { return brave_js_1.BraveSearchProvider; } });
var provider_manager_js_1 = require("./provider-manager.js");
Object.defineProperty(exports, "WebSearchProviderManager", { enumerable: true, get: function () { return provider_manager_js_1.WebSearchProviderManager; } });
//# sourceMappingURL=index.js.map