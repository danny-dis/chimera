"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonRpcLspConnection = void 0;
exports.createJsonRpcConnection = createJsonRpcConnection;
exports.startLspConnection = startLspConnection;
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const node_1 = require("vscode-jsonrpc/node");
const node_2 = require("vscode-jsonrpc/node");
class JsonRpcLspConnection {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    listen() {
        this.connection.listen();
    }
    sendRequest(method, params) {
        return this.connection.sendRequest(method, params);
    }
    sendNotification(method, params) {
        this.connection.sendNotification(method, params);
    }
    onNotification(method, handler) {
        return this.connection.onNotification(method, handler);
    }
    dispose() {
        this.connection.dispose();
    }
}
exports.JsonRpcLspConnection = JsonRpcLspConnection;
async function createJsonRpcConnection(child) {
    const connection = (0, node_1.createMessageConnection)(new node_2.StreamMessageReader(child.stdout), new node_2.StreamMessageWriter(child.stdin));
    return new JsonRpcLspConnection(connection);
}
async function startLspConnection(options) {
    const isWindows = process.platform === 'win32';
    const child = (0, child_process_1.spawn)(options.config.command, options.config.args ?? [], {
        cwd: options.config.cwd ? resolveCwd(options.config.cwd, options.workspaceRoot) : options.workspaceRoot,
        env: { ...process.env, ...(options.config.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: isWindows,
    });
    const factory = options.connectionFactory ?? createJsonRpcConnection;
    const connection = await factory(child, options.config);
    connection.listen();
    return { child, connection };
}
function resolveCwd(cwd, workspaceRoot) {
    if (cwd.match(/^[A-Za-z]:[\\/]/) || cwd.startsWith('\\\\') || cwd.startsWith('/')) {
        return cwd;
    }
    return path_1.default.resolve(workspaceRoot, cwd);
}
//# sourceMappingURL=connection.js.map