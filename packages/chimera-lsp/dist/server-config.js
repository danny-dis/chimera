"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverMatchesFile = serverMatchesFile;
exports.matchesRootFiles = matchesRootFiles;
exports.matchesPattern = matchesPattern;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const uri_js_1 = require("./uri.js");
function serverMatchesFile(server, filePath, workspaceRoot) {
    if (server.enabled === false)
        return false;
    if (!matchesRootFiles(server, workspaceRoot))
        return false;
    if (server.filePatterns && server.filePatterns.length > 0) {
        const relative = path_1.default.relative(workspaceRoot, (0, uri_js_1.toAbsolutePath)(filePath, workspaceRoot)).replace(/\\/g, '/');
        return server.filePatterns.some((pattern) => matchesPattern(relative, pattern));
    }
    return true;
}
function matchesRootFiles(server, workspaceRoot) {
    if (!server.rootFiles || server.rootFiles.length === 0)
        return true;
    return server.rootFiles.some((file) => (0, fs_1.existsSync)(path_1.default.join(workspaceRoot, file)));
}
function matchesPattern(value, pattern) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const regex = new RegExp(`^${escapeRegex(normalizedPattern)
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*')
        .replace(/\?/g, '[^/]')}$`);
    return regex.test(value.replace(/\\/g, '/'));
}
function escapeRegex(value) {
    return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=server-config.js.map