"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCommand = exports.classifyChainedCommand = exports.classifyBlastRadius = exports.createBuiltinPolicy = exports.getBuiltinPolicyNames = exports.networkPolicy = exports.destructiveCommandsPolicy = exports.maxToolCallsPolicy = exports.costBudgetPolicy = exports.trustedProjectPolicy = exports.workspaceWritePolicy = exports.readOnlyPolicy = exports.askOnOsTools = exports.createPolicyStackFromConfig = exports.PolicyStack = exports.customProfile = exports.fullAccessProfile = exports.editFilesProfile = exports.readOnlyProfile = exports.PermissionEngine = exports.PermissionManager = void 0;
var permission_manager_js_1 = require("./permission-manager.js");
Object.defineProperty(exports, "PermissionManager", { enumerable: true, get: function () { return permission_manager_js_1.PermissionManager; } });
// Policy engine
var policy_js_1 = require("./policy.js");
Object.defineProperty(exports, "PermissionEngine", { enumerable: true, get: function () { return policy_js_1.PermissionEngine; } });
Object.defineProperty(exports, "readOnlyProfile", { enumerable: true, get: function () { return policy_js_1.readOnlyProfile; } });
Object.defineProperty(exports, "editFilesProfile", { enumerable: true, get: function () { return policy_js_1.editFilesProfile; } });
Object.defineProperty(exports, "fullAccessProfile", { enumerable: true, get: function () { return policy_js_1.fullAccessProfile; } });
Object.defineProperty(exports, "customProfile", { enumerable: true, get: function () { return policy_js_1.customProfile; } });
// Policy stack — three-level governance
var policy_stack_js_1 = require("./policy-stack.js");
Object.defineProperty(exports, "PolicyStack", { enumerable: true, get: function () { return policy_stack_js_1.PolicyStack; } });
Object.defineProperty(exports, "createPolicyStackFromConfig", { enumerable: true, get: function () { return policy_stack_js_1.createPolicyStackFromConfig; } });
// Builtin policies
var builtins_js_1 = require("./builtins.js");
Object.defineProperty(exports, "askOnOsTools", { enumerable: true, get: function () { return builtins_js_1.askOnOsTools; } });
Object.defineProperty(exports, "readOnlyPolicy", { enumerable: true, get: function () { return builtins_js_1.readOnlyPolicy; } });
Object.defineProperty(exports, "workspaceWritePolicy", { enumerable: true, get: function () { return builtins_js_1.workspaceWritePolicy; } });
Object.defineProperty(exports, "trustedProjectPolicy", { enumerable: true, get: function () { return builtins_js_1.trustedProjectPolicy; } });
Object.defineProperty(exports, "costBudgetPolicy", { enumerable: true, get: function () { return builtins_js_1.costBudgetPolicy; } });
Object.defineProperty(exports, "maxToolCallsPolicy", { enumerable: true, get: function () { return builtins_js_1.maxToolCallsPolicy; } });
Object.defineProperty(exports, "destructiveCommandsPolicy", { enumerable: true, get: function () { return builtins_js_1.destructiveCommandsPolicy; } });
Object.defineProperty(exports, "networkPolicy", { enumerable: true, get: function () { return builtins_js_1.networkPolicy; } });
Object.defineProperty(exports, "getBuiltinPolicyNames", { enumerable: true, get: function () { return builtins_js_1.getBuiltinPolicyNames; } });
Object.defineProperty(exports, "createBuiltinPolicy", { enumerable: true, get: function () { return builtins_js_1.createBuiltinPolicy; } });
// Blast radius — classify commands by reversibility
var blast_radius_js_1 = require("./blast-radius.js");
Object.defineProperty(exports, "classifyBlastRadius", { enumerable: true, get: function () { return blast_radius_js_1.classifyBlastRadius; } });
Object.defineProperty(exports, "classifyChainedCommand", { enumerable: true, get: function () { return blast_radius_js_1.classifyChainedCommand; } });
Object.defineProperty(exports, "parseCommand", { enumerable: true, get: function () { return blast_radius_js_1.parseCommand; } });
//# sourceMappingURL=index.js.map