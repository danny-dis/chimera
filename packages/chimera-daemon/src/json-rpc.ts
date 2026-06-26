// ---------------------------------------------------------------------------
// JSON-RPC 2.0 transport over stdio (line-delimited)
// ---------------------------------------------------------------------------

import { type JsonRpcMessage } from './types.js';

/**
 * Reads one JSON-RPC message from stdin.
 * Messages are newline-delimited JSON (NDJSON).
 */
export function readMessage(input: string): JsonRpcMessage | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JsonRpcMessage;
  } catch {
    return null;
  }
}

/**
 * Writes a JSON-RPC message to stdout as a single line.
 */
export function writeMessage(msg: JsonRpcMessage): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/**
 * Creates a JSON-RPC 2.0 success response.
 */
export function success(id: string | number, result: unknown): JsonRpcMessage {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Creates a JSON-RPC 2.0 error response.
 */
export function error(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcMessage {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// Standard JSON-RPC error codes
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_EXECUTION_ERROR: -32000,
  CONFIG_ERROR: -32001,
} as const;