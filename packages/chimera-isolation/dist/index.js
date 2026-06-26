"use strict";
// @chimera/isolation — Worktree-based isolation for parallel agent runs.
// Public API is exported below; implementation files live in providers/.
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeWorktree = exports.cleanupStaleWorktrees = exports.IsolationBlockedError = exports.classifyIsolationError = exports.copyWorktreeFiles = exports.resolveRepoLocalOverride = exports.shortHash = exports.slugify = exports.WorktreeProvider = void 0;
var worktree_js_1 = require("./providers/worktree.js");
Object.defineProperty(exports, "WorktreeProvider", { enumerable: true, get: function () { return worktree_js_1.WorktreeProvider; } });
var worktree_helpers_js_1 = require("./providers/worktree-helpers.js");
Object.defineProperty(exports, "slugify", { enumerable: true, get: function () { return worktree_helpers_js_1.slugify; } });
Object.defineProperty(exports, "shortHash", { enumerable: true, get: function () { return worktree_helpers_js_1.shortHash; } });
Object.defineProperty(exports, "resolveRepoLocalOverride", { enumerable: true, get: function () { return worktree_helpers_js_1.resolveRepoLocalOverride; } });
var worktree_copy_js_1 = require("./worktree-copy.js");
Object.defineProperty(exports, "copyWorktreeFiles", { enumerable: true, get: function () { return worktree_copy_js_1.copyWorktreeFiles; } });
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "classifyIsolationError", { enumerable: true, get: function () { return errors_js_1.classifyIsolationError; } });
Object.defineProperty(exports, "IsolationBlockedError", { enumerable: true, get: function () { return errors_js_1.IsolationBlockedError; } });
var cleanup_js_1 = require("./cleanup.js");
Object.defineProperty(exports, "cleanupStaleWorktrees", { enumerable: true, get: function () { return cleanup_js_1.cleanupStaleWorktrees; } });
Object.defineProperty(exports, "removeWorktree", { enumerable: true, get: function () { return cleanup_js_1.removeWorktree; } });
//# sourceMappingURL=index.js.map