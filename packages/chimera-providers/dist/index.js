"use strict";
// @chimera/providers — Provider abstraction layer
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOOGLE_CAPABILITIES = exports.OLLAMA_CAPABILITIES = exports.OPENROUTER_CAPABILITIES = exports.OPENAI_CAPABILITIES = exports.ANTHROPIC_CAPABILITIES = exports.DEFAULT_CAPABILITIES = exports.StructuredOutputLevel = exports.ProviderCapabilitiesSchema = exports.OpenRouterProvider = exports.OpenAICompatibleProvider = exports.createDefaultMockProvider = exports.MockProvider = exports.StreamingError = exports.InvalidConfigError = exports.ProviderUnavailableError = exports.QuotaExceededError = exports.RateLimitError = exports.ProviderError = exports.ModelComparator = exports.CostProjectionEngine = exports.RateLimiter = exports.BudgetEnforcer = exports.ProviderCostTracker = exports.CostCalculator = exports.ModelEntrySchema = exports.ModelRegistry = exports.ProviderConfigSchema = exports.listModels = exports.ProviderFactory = exports.ProviderRegistry = void 0;
var provider_registry_js_1 = require("./provider-registry.js");
Object.defineProperty(exports, "ProviderRegistry", { enumerable: true, get: function () { return provider_registry_js_1.ProviderRegistry; } });
var provider_factory_js_1 = require("./provider-factory.js");
Object.defineProperty(exports, "ProviderFactory", { enumerable: true, get: function () { return provider_factory_js_1.ProviderFactory; } });
Object.defineProperty(exports, "listModels", { enumerable: true, get: function () { return provider_factory_js_1.listModels; } });
var model_adapter_js_1 = require("./model-adapter.js");
Object.defineProperty(exports, "ProviderConfigSchema", { enumerable: true, get: function () { return model_adapter_js_1.ProviderConfigSchema; } });
var model_registry_js_1 = require("./model-registry.js");
Object.defineProperty(exports, "ModelRegistry", { enumerable: true, get: function () { return model_registry_js_1.ModelRegistry; } });
Object.defineProperty(exports, "ModelEntrySchema", { enumerable: true, get: function () { return model_registry_js_1.ModelEntrySchema; } });
var cost_calculator_js_1 = require("./cost-calculator.js");
Object.defineProperty(exports, "CostCalculator", { enumerable: true, get: function () { return cost_calculator_js_1.CostCalculator; } });
var cost_tracker_provider_js_1 = require("./cost-tracker-provider.js");
Object.defineProperty(exports, "ProviderCostTracker", { enumerable: true, get: function () { return cost_tracker_provider_js_1.ProviderCostTracker; } });
var budget_enforcer_js_1 = require("./budget-enforcer.js");
Object.defineProperty(exports, "BudgetEnforcer", { enumerable: true, get: function () { return budget_enforcer_js_1.BudgetEnforcer; } });
var rate_limiter_js_1 = require("./rate-limiter.js");
Object.defineProperty(exports, "RateLimiter", { enumerable: true, get: function () { return rate_limiter_js_1.RateLimiter; } });
var cost_projection_js_1 = require("./cost-projection.js");
Object.defineProperty(exports, "CostProjectionEngine", { enumerable: true, get: function () { return cost_projection_js_1.CostProjectionEngine; } });
var model_comparator_js_1 = require("./model-comparator.js");
Object.defineProperty(exports, "ModelComparator", { enumerable: true, get: function () { return model_comparator_js_1.ModelComparator; } });
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "ProviderError", { enumerable: true, get: function () { return errors_js_1.ProviderError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_js_1.RateLimitError; } });
Object.defineProperty(exports, "QuotaExceededError", { enumerable: true, get: function () { return errors_js_1.QuotaExceededError; } });
Object.defineProperty(exports, "ProviderUnavailableError", { enumerable: true, get: function () { return errors_js_1.ProviderUnavailableError; } });
Object.defineProperty(exports, "InvalidConfigError", { enumerable: true, get: function () { return errors_js_1.InvalidConfigError; } });
Object.defineProperty(exports, "StreamingError", { enumerable: true, get: function () { return errors_js_1.StreamingError; } });
// Offline mock — used when no real provider is configured (CI, dev, first-run)
var mock_js_1 = require("./providers/mock.js");
Object.defineProperty(exports, "MockProvider", { enumerable: true, get: function () { return mock_js_1.MockProvider; } });
Object.defineProperty(exports, "createDefaultMockProvider", { enumerable: true, get: function () { return mock_js_1.createDefaultMockProvider; } });
// OpenAI-compatible provider (base for OpenRouter, etc.)
var openai_compatible_js_1 = require("./providers/openai-compatible.js");
Object.defineProperty(exports, "OpenAICompatibleProvider", { enumerable: true, get: function () { return openai_compatible_js_1.OpenAICompatibleProvider; } });
// OpenRouter — routes to 200+ models via single API key
var openrouter_js_1 = require("./providers/openrouter.js");
Object.defineProperty(exports, "OpenRouterProvider", { enumerable: true, get: function () { return openrouter_js_1.OpenRouterProvider; } });
var capabilities_js_1 = require("./types/capabilities.js");
Object.defineProperty(exports, "ProviderCapabilitiesSchema", { enumerable: true, get: function () { return capabilities_js_1.ProviderCapabilitiesSchema; } });
Object.defineProperty(exports, "StructuredOutputLevel", { enumerable: true, get: function () { return capabilities_js_1.StructuredOutputLevel; } });
Object.defineProperty(exports, "DEFAULT_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.DEFAULT_CAPABILITIES; } });
Object.defineProperty(exports, "ANTHROPIC_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.ANTHROPIC_CAPABILITIES; } });
Object.defineProperty(exports, "OPENAI_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.OPENAI_CAPABILITIES; } });
Object.defineProperty(exports, "OPENROUTER_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.OPENROUTER_CAPABILITIES; } });
Object.defineProperty(exports, "OLLAMA_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.OLLAMA_CAPABILITIES; } });
Object.defineProperty(exports, "GOOGLE_CAPABILITIES", { enumerable: true, get: function () { return capabilities_js_1.GOOGLE_CAPABILITIES; } });
//# sourceMappingURL=index.js.map