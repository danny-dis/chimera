"use strict";
// @chimera/core/workflow — declarative workflow types, registry, and YAML/JSON loader
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultWorkflowFor = exports.registerBuiltInWorkflows = exports.DEFAULT_WORKFLOW_FOR_MODE = exports.BUILT_IN_WORKFLOWS = exports.WorkflowDispatcher = exports.detectCompletionSignal = exports.runLoopStep = exports.runWorkflow = exports.workflowLoaderSchema = exports.WorkflowAutoLoader = exports.WorkflowLoader = exports.WorkflowRegistry = void 0;
var registry_js_1 = require("./registry.js");
Object.defineProperty(exports, "WorkflowRegistry", { enumerable: true, get: function () { return registry_js_1.WorkflowRegistry; } });
var loader_js_1 = require("./loader.js");
Object.defineProperty(exports, "WorkflowLoader", { enumerable: true, get: function () { return loader_js_1.WorkflowLoader; } });
Object.defineProperty(exports, "WorkflowAutoLoader", { enumerable: true, get: function () { return loader_js_1.WorkflowAutoLoader; } });
var loader_js_2 = require("./loader.js");
Object.defineProperty(exports, "workflowLoaderSchema", { enumerable: true, get: function () { return loader_js_2.workflowLoaderSchema; } });
// Runner — pure interpreter; no LLM/IO of its own, all side effects via handlers.
var runner_js_1 = require("./runner.js");
Object.defineProperty(exports, "runWorkflow", { enumerable: true, get: function () { return runner_js_1.runWorkflow; } });
// Loop helpers — exported for direct use by command handlers.
var runner_js_2 = require("./runner.js");
Object.defineProperty(exports, "runLoopStep", { enumerable: true, get: function () { return runner_js_2.runLoopStep; } });
Object.defineProperty(exports, "detectCompletionSignal", { enumerable: true, get: function () { return runner_js_2.detectCompletionSignal; } });
// Dispatcher — background execution engine for workflows.
var dispatcher_js_1 = require("./dispatcher.js");
Object.defineProperty(exports, "WorkflowDispatcher", { enumerable: true, get: function () { return dispatcher_js_1.WorkflowDispatcher; } });
// Built-ins — the workflow set that ships with chimera. Auto-registered on
// every CLI launch via `registerBuiltInWorkflows(registry, eventStream)`.
var index_js_1 = require("./builtins/index.js");
Object.defineProperty(exports, "BUILT_IN_WORKFLOWS", { enumerable: true, get: function () { return index_js_1.BUILT_IN_WORKFLOWS; } });
Object.defineProperty(exports, "DEFAULT_WORKFLOW_FOR_MODE", { enumerable: true, get: function () { return index_js_1.DEFAULT_WORKFLOW_FOR_MODE; } });
Object.defineProperty(exports, "registerBuiltInWorkflows", { enumerable: true, get: function () { return index_js_1.registerBuiltInWorkflows; } });
Object.defineProperty(exports, "defaultWorkflowFor", { enumerable: true, get: function () { return index_js_1.defaultWorkflowFor; } });
//# sourceMappingURL=index.js.map