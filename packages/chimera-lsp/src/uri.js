"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathToUri = pathToUri;
exports.uriToPath = uriToPath;
exports.toAbsolutePath = toAbsolutePath;
exports.relativePath = relativePath;
const path_1 = __importDefault(require("path"));
const vscode_uri_1 = require("vscode-uri");
function pathToUri(filePath, workspaceRoot) {
    const absolute = filePath.startsWith('file:') ? filePath : toAbsolutePath(filePath, workspaceRoot);
    return vscode_uri_1.URI.file(absolute).toString();
}
function uriToPath(uri) {
    return vscode_uri_1.URI.parse(uri).fsPath;
}
function toAbsolutePath(filePath, workspaceRoot) {
    if (filePath.startsWith('file:'))
        return uriToPath(filePath);
    return filePath.match(/^[A-Za-z]:[\\/]/) || filePath.startsWith('\\\\') || filePath.startsWith('/')
        ? filePath
        : path_1.default.resolve(workspaceRoot, filePath);
}
function relativePath(filePath, workspaceRoot) {
    const absolute = toAbsolutePath(filePath, workspaceRoot);
    const relative = path_1.default.relative(workspaceRoot, absolute);
    return relative || '.';
}
//# sourceMappingURL=uri.js.map