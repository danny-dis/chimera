import { type JsonRpcMessage } from './types.js';
/**
 * Reads one JSON-RPC message from stdin.
 * Messages are newline-delimited JSON (NDJSON).
 */
export declare function readMessage(input: string): JsonRpcMessage | null;
/**
 * Writes a JSON-RPC message to stdout as a single line.
 */
export declare function writeMessage(msg: JsonRpcMessage): void;
/**
 * Creates a JSON-RPC 2.0 success response.
 */
export declare function success(id: string | number, result: unknown): JsonRpcMessage;
/**
 * Creates a JSON-RPC 2.0 error response.
 */
export declare function error(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcMessage;
export declare const ErrorCodes: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly TASK_EXECUTION_ERROR: -32000;
    readonly CONFIG_ERROR: -32001;
};
//# sourceMappingURL=json-rpc.d.ts.map