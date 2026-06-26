"use strict";
// ---------------------------------------------------------------------------
// JSON-RPC 2.0 transport over stdio (line-delimited)
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCodes = void 0;
exports.readMessage = readMessage;
exports.writeMessage = writeMessage;
exports.success = success;
exports.error = error;
/**
 * Reads one JSON-RPC message from stdin.
 * Messages are newline-delimited JSON (NDJSON).
 */
function readMessage(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object')
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/**
 * Writes a JSON-RPC message to stdout as a single line.
 */
function writeMessage(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}
/**
 * Creates a JSON-RPC 2.0 success response.
 */
function success(id, result) {
    return { jsonrpc: '2.0', id, result };
}
/**
 * Creates a JSON-RPC 2.0 error response.
 */
function error(id, code, message, data) {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
}
// Standard JSON-RPC error codes
exports.ErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    TASK_EXECUTION_ERROR: -32000,
    CONFIG_ERROR: -32001,
};
//# sourceMappingURL=json-rpc.js.map