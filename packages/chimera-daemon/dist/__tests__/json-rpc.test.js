"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const json_rpc_js_1 = require("../json-rpc.js");
(0, vitest_1.describe)('JSON-RPC helpers', () => {
    (0, vitest_1.describe)('readMessage', () => {
        (0, vitest_1.it)('parses a valid JSON-RPC request', () => {
            const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)(msg)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' });
        });
        (0, vitest_1.it)('returns null for empty string', () => {
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('')).toBeNull();
        });
        (0, vitest_1.it)('returns null for whitespace-only string', () => {
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('   ')).toBeNull();
        });
        (0, vitest_1.it)('returns null for invalid JSON', () => {
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('{not json}')).toBeNull();
        });
        (0, vitest_1.it)('returns null for non-object JSON', () => {
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('"just a string"')).toBeNull();
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('42')).toBeNull();
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)('null')).toBeNull();
        });
        (0, vitest_1.it)('trims whitespace before parsing', () => {
            const msg = '  {"jsonrpc":"2.0","id":1,"method":"ping"}  ';
            (0, vitest_1.expect)((0, json_rpc_js_1.readMessage)(msg)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' });
        });
    });
    (0, vitest_1.describe)('writeMessage', () => {
        let stdoutWrite;
        (0, vitest_1.beforeEach)(() => {
            stdoutWrite = vitest_1.vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        });
        (0, vitest_1.afterEach)(() => {
            stdoutWrite.mockRestore();
        });
        (0, vitest_1.it)('writes JSON followed by newline', () => {
            const msg = { jsonrpc: '2.0', id: 1, result: 'pong' };
            (0, json_rpc_js_1.writeMessage)(msg);
            (0, vitest_1.expect)(stdoutWrite).toHaveBeenCalledWith(JSON.stringify(msg) + '\n');
        });
    });
    (0, vitest_1.describe)('success', () => {
        (0, vitest_1.it)('creates a success response', () => {
            const resp = (0, json_rpc_js_1.success)(42, { data: 'ok' });
            (0, vitest_1.expect)(resp).toEqual({ jsonrpc: '2.0', id: 42, result: { data: 'ok' } });
        });
        (0, vitest_1.it)('works with string id', () => {
            const resp = (0, json_rpc_js_1.success)('abc', null);
            (0, vitest_1.expect)(resp).toEqual({ jsonrpc: '2.0', id: 'abc', result: null });
        });
    });
    (0, vitest_1.describe)('error', () => {
        (0, vitest_1.it)('creates an error response', () => {
            const resp = (0, json_rpc_js_1.error)(1, -32601, 'Method not found');
            (0, vitest_1.expect)(resp).toEqual({
                jsonrpc: '2.0',
                id: 1,
                error: { code: -32601, message: 'Method not found', data: undefined },
            });
        });
        (0, vitest_1.it)('includes data when provided', () => {
            const resp = (0, json_rpc_js_1.error)(null, -32700, 'Parse error', { raw: 'bad' });
            (0, vitest_1.expect)(resp).toEqual({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error', data: { raw: 'bad' } },
            });
        });
    });
    (0, vitest_1.describe)('ErrorCodes', () => {
        (0, vitest_1.it)('has standard JSON-RPC error codes', () => {
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.PARSE_ERROR).toBe(-32700);
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.INVALID_REQUEST).toBe(-32600);
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.INVALID_PARAMS).toBe(-32602);
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.INTERNAL_ERROR).toBe(-32603);
        });
        (0, vitest_1.it)('has chimera-specific error codes', () => {
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.TASK_EXECUTION_ERROR).toBe(-32000);
            (0, vitest_1.expect)(json_rpc_js_1.ErrorCodes.CONFIG_ERROR).toBe(-32001);
        });
    });
});
//# sourceMappingURL=json-rpc.test.js.map