"use strict";
// @chimera/context — Context engine and relay racing
Object.defineProperty(exports, "__esModule", { value: true });
exports.declaredFieldsFromSchema = exports.OutputRefError = exports.resolveNodeOutputField = exports.contextCollapse = exports.microCompact = exports.snipCompact = exports.applyToolResultBudget = exports.runCompactionPipeline = exports.ContextBudget = exports.ToolContextRelay = exports.HandoffProtocol = exports.RelayRacing = exports.VectorStore = exports.TfIdfEmbeddingProvider = exports.ContextEngine = void 0;
var context_engine_js_1 = require("./context-engine.js");
Object.defineProperty(exports, "ContextEngine", { enumerable: true, get: function () { return context_engine_js_1.ContextEngine; } });
var embedding_provider_js_1 = require("./embedding-provider.js");
Object.defineProperty(exports, "TfIdfEmbeddingProvider", { enumerable: true, get: function () { return embedding_provider_js_1.TfIdfEmbeddingProvider; } });
var vector_store_js_1 = require("./vector-store.js");
Object.defineProperty(exports, "VectorStore", { enumerable: true, get: function () { return vector_store_js_1.VectorStore; } });
var relay_racing_js_1 = require("./relay-racing.js");
Object.defineProperty(exports, "RelayRacing", { enumerable: true, get: function () { return relay_racing_js_1.RelayRacing; } });
var handoff_protocol_js_1 = require("./handoff-protocol.js");
Object.defineProperty(exports, "HandoffProtocol", { enumerable: true, get: function () { return handoff_protocol_js_1.HandoffProtocol; } });
var tool_context_relay_js_1 = require("./tool-context-relay.js");
Object.defineProperty(exports, "ToolContextRelay", { enumerable: true, get: function () { return tool_context_relay_js_1.ToolContextRelay; } });
var context_budget_js_1 = require("./context-budget.js");
Object.defineProperty(exports, "ContextBudget", { enumerable: true, get: function () { return context_budget_js_1.ContextBudget; } });
var index_js_1 = require("./compaction/index.js");
Object.defineProperty(exports, "runCompactionPipeline", { enumerable: true, get: function () { return index_js_1.runCompactionPipeline; } });
Object.defineProperty(exports, "applyToolResultBudget", { enumerable: true, get: function () { return index_js_1.applyToolResultBudget; } });
Object.defineProperty(exports, "snipCompact", { enumerable: true, get: function () { return index_js_1.snipCompact; } });
Object.defineProperty(exports, "microCompact", { enumerable: true, get: function () { return index_js_1.microCompact; } });
Object.defineProperty(exports, "contextCollapse", { enumerable: true, get: function () { return index_js_1.contextCollapse; } });
// Output-ref resolver (for $nodeId.output.field references)
var output_ref_js_1 = require("./output-ref.js");
Object.defineProperty(exports, "resolveNodeOutputField", { enumerable: true, get: function () { return output_ref_js_1.resolveNodeOutputField; } });
Object.defineProperty(exports, "OutputRefError", { enumerable: true, get: function () { return output_ref_js_1.OutputRefError; } });
Object.defineProperty(exports, "declaredFieldsFromSchema", { enumerable: true, get: function () { return output_ref_js_1.declaredFieldsFromSchema; } });
//# sourceMappingURL=index.js.map