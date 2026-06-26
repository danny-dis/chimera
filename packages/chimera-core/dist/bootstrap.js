"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultWorkflowFor = void 0;
exports.bootstrap = bootstrap;
const registry_js_1 = require("./workflow/registry.js");
const index_js_1 = require("./workflow/builtins/index.js");
/**
 * Stand up a chimera runtime. Pure function: no module-level mutation,
 * no hidden state. Calling it twice gives two independent registries.
 */
function bootstrap(opts = {}) {
    const eventStream = opts.eventStream;
    const workflowRegistry = new registry_js_1.WorkflowRegistry();
    (0, index_js_1.registerBuiltInWorkflows)(workflowRegistry, eventStream);
    return { workflowRegistry };
}
/**
 * Convenience: pick the default workflow for a given mode. Equivalent
 * to `defaultWorkflowFor(mode)` but re-exported here so a host can
 * import everything from the bootstrap module if it wants.
 */
var index_js_2 = require("./workflow/builtins/index.js");
Object.defineProperty(exports, "defaultWorkflowFor", { enumerable: true, get: function () { return index_js_2.defaultWorkflowFor; } });
//# sourceMappingURL=bootstrap.js.map