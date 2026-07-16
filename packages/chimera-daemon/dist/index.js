#!/usr/bin/env node
"use strict";
/**
 * Chimera daemon — stdio-based JSON-RPC 2.0 server.
 *
 * Start:  node dist/index.js
 * Protocol: newline-delimited JSON over stdin/stdout
 *           Extension writes requests to stdin, reads responses from stdout
 *
 * This is the "local daemon" described in the chimer-a-agent-blueprint Phase 7:
 * a persistent process that IDE clients (VS Code, JetBrains, Neovim) connect to
 * and reuse the same chimera runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChimeraDaemon = void 0;
exports.runStdioServer = runStdioServer;
const server_js_1 = require("./server.js");
var server_js_2 = require("./server.js");
Object.defineProperty(exports, "ChimeraDaemon", { enumerable: true, get: function () { return server_js_2.ChimeraDaemon; } });
const json_rpc_js_1 = require("./json-rpc.js");
// Suppress non-JSON output — everything goes through writeMessage()
const ORIGINAL_STDOUT_WRITE = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk) => {
    // Only allow JSON lines through
    const str = String(chunk);
    if (str.startsWith('{') || str.startsWith('\n')) {
        return ORIGINAL_STDOUT_WRITE(chunk);
    }
    return true;
});
// Stderr for logging only
const log = (msg) => {
    process.stderr.write(`[chimera-daemon] ${msg}\n`);
};
async function main() {
    const daemon = new server_js_1.ChimeraDaemon();
    await runStdioServer(daemon);
}
/** Run the JSON-RPC 2.0 read/dispatch loop over process stdio.
 *  Shared by the standalone daemon and `chimera --mode rpc`. */
async function runStdioServer(daemon) {
    let buffer = '';
    // Write a startup notification so the client knows we're ready
    (0, json_rpc_js_1.writeMessage)({
        jsonrpc: '2.0',
        method: 'ready',
        params: { version: process.env.npm_package_version || '0.0.1' },
    });
    // Clean up subscriptions when the client disconnects
    process.stdin.on('end', () => {
        daemon.cleanupSubscriptions();
    });
    // Read lines from stdin
    for await (const chunk of process.stdin) {
        buffer += String(chunk);
        // Process complete lines
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line)
                continue;
            const request = (0, json_rpc_js_1.readMessage)(line);
            if (!request) {
                (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.error)(null, json_rpc_js_1.ErrorCodes.PARSE_ERROR, 'Invalid JSON-RPC message'));
                continue;
            }
            await daemon.handleRequest(request);
        }
    }
}
main().catch((err) => {
    log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map