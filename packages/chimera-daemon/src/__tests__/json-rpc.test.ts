import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readMessage, writeMessage, success, error, ErrorCodes } from '../json-rpc.js';

describe('JSON-RPC helpers', () => {
  describe('readMessage', () => {
    it('parses a valid JSON-RPC request', () => {
      const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
      expect(readMessage(msg)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' });
    });

    it('returns null for empty string', () => {
      expect(readMessage('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(readMessage('   ')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(readMessage('{not json}')).toBeNull();
    });

    it('returns null for non-object JSON', () => {
      expect(readMessage('"just a string"')).toBeNull();
      expect(readMessage('42')).toBeNull();
      expect(readMessage('null')).toBeNull();
    });

    it('trims whitespace before parsing', () => {
      const msg = '  {"jsonrpc":"2.0","id":1,"method":"ping"}  ';
      expect(readMessage(msg)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' });
    });
  });

  describe('writeMessage', () => {
    let stdoutWrite: any;

    beforeEach(() => {
      stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutWrite.mockRestore();
    });

    it('writes JSON followed by newline', () => {
      const msg = { jsonrpc: '2.0' as const, id: 1, result: 'pong' };
      writeMessage(msg);
      expect(stdoutWrite).toHaveBeenCalledWith(JSON.stringify(msg) + '\n');
    });
  });

  describe('success', () => {
    it('creates a success response', () => {
      const resp = success(42, { data: 'ok' });
      expect(resp).toEqual({ jsonrpc: '2.0', id: 42, result: { data: 'ok' } });
    });

    it('works with string id', () => {
      const resp = success('abc', null);
      expect(resp).toEqual({ jsonrpc: '2.0', id: 'abc', result: null });
    });
  });

  describe('error', () => {
    it('creates an error response', () => {
      const resp = error(1, -32601, 'Method not found');
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found', data: undefined },
      });
    });

    it('includes data when provided', () => {
      const resp = error(null, -32700, 'Parse error', { raw: 'bad' });
      expect(resp).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: { raw: 'bad' } },
      });
    });
  });

  describe('ErrorCodes', () => {
    it('has standard JSON-RPC error codes', () => {
      expect(ErrorCodes.PARSE_ERROR).toBe(-32700);
      expect(ErrorCodes.INVALID_REQUEST).toBe(-32600);
      expect(ErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
      expect(ErrorCodes.INVALID_PARAMS).toBe(-32602);
      expect(ErrorCodes.INTERNAL_ERROR).toBe(-32603);
    });

    it('has chimera-specific error codes', () => {
      expect(ErrorCodes.TASK_EXECUTION_ERROR).toBe(-32000);
      expect(ErrorCodes.CONFIG_ERROR).toBe(-32001);
    });
  });
});
