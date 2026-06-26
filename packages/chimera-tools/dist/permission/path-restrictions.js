"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathRestrictionEngine = void 0;
const zod_1 = require("zod");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const PathRestrictionConfigSchema = zod_1.z.object({
    workspaceRoot: zod_1.z.string(),
    allowedPatterns: zod_1.z.array(zod_1.z.string()).optional(),
});
class PathRestrictionEngine {
    resolvedWorkspace;
    allowedPatterns;
    constructor(workspaceRoot, allowedPatterns) {
        PathRestrictionConfigSchema.parse({ workspaceRoot, allowedPatterns });
        this.resolvedWorkspace = node_path_1.default.resolve(workspaceRoot);
        this.allowedPatterns = (allowedPatterns ?? []).map((p) => new RegExp(p));
    }
    isPathAllowed(inputPath) {
        return this.getViolation(inputPath) === null;
    }
    resolvePath(inputPath) {
        if (node_path_1.default.isAbsolute(inputPath)) {
            return node_path_1.default.normalize(inputPath);
        }
        return node_path_1.default.normalize(node_path_1.default.join(this.resolvedWorkspace, inputPath));
    }
    getViolation(inputPath) {
        if (this.containsTraversal(inputPath)) {
            return 'Path traversal detected (../ sequences)';
        }
        const resolved = this.resolvePath(inputPath);
        if (node_path_1.default.isAbsolute(inputPath) && !this.isWithinWorkspace(resolved)) {
            for (const pattern of this.allowedPatterns) {
                if (pattern.test(resolved)) {
                    return null;
                }
            }
            return `Absolute path outside workspace: ${resolved}`;
        }
        if (!this.isWithinWorkspace(resolved)) {
            for (const pattern of this.allowedPatterns) {
                if (pattern.test(resolved)) {
                    return null;
                }
            }
            return `Resolved path escapes workspace: ${resolved}`;
        }
        if (this.isSymlinkEscaping(resolved)) {
            return 'Symlink resolves outside workspace';
        }
        return null;
    }
    containsTraversal(inputPath) {
        const normalized = node_path_1.default.normalize(inputPath);
        const segments = normalized.split(node_path_1.default.sep);
        let depth = 0;
        for (const segment of segments) {
            if (segment === '..') {
                depth -= 1;
                if (depth < 0)
                    return true;
            }
            else if (segment !== '' && segment !== '.') {
                depth += 1;
            }
        }
        return false;
    }
    isWithinWorkspace(resolvedPath) {
        const relative = node_path_1.default.relative(this.resolvedWorkspace, resolvedPath);
        return !relative.startsWith('..') && !node_path_1.default.isAbsolute(relative);
    }
    isSymlinkEscaping(resolvedPath) {
        try {
            if (!node_fs_1.default.existsSync(resolvedPath)) {
                return false;
            }
            const realPath = node_fs_1.default.realpathSync(resolvedPath);
            return !this.isWithinWorkspace(realPath);
        }
        catch {
            return false;
        }
    }
}
exports.PathRestrictionEngine = PathRestrictionEngine;
//# sourceMappingURL=path-restrictions.js.map