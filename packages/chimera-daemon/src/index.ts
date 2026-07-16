#!/usr/bin/env node
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

import { ChimeraDaemon } from './server.js';
export { ChimeraDaemon } from './server.js';
import { readMessage, writeMessage, error, ErrorCodes } from './json-rpc.js';

// Suppress non-JSON output — everything goes through writeMessage()
const ORIGINAL_STDOUT_WRITE = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: any) => {
  // Only allow JSON lines through
  const str = String(chunk);
  if (str.startsWith('{') || str.startsWith('\n')) {
    return ORIGINAL_STDOUT_WRITE(chunk);
  }
  return true;
}) as any;

// Stderr for logging only
const log = (msg: string) => {
  process.stderr.write(`[chimera-daemon] ${msg}\n`);
};

async function main(): Promise<void> {
  const daemon = new ChimeraDaemon();
  await runStdioServer(daemon);
}

/** Run the JSON-RPC 2.0 read/dispatch loop over process stdio.
 *  Shared by the standalone daemon and `chimera --mode rpc`. */
export async function runStdioServer(daemon: ChimeraDaemon): Promise<void> {
  let buffer = '';

  // Write a startup notification so the client knows we're ready
  writeMessage({
    jsonrpc: '2.0',
    method: 'ready',
    params: { version: process.env.npm_package_version || '0.0.1' },
  } as any);

  // Clean up subscriptions when the client disconnects
  process.stdin.on('end', () => {
    daemon.cleanupSubscriptions();
  });

  // Read lines from stdin
  for await (const chunk of process.stdin) {
    buffer += String(chunk);

    // Process complete lines
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line) continue;

      const request = readMessage(line);
      if (!request) {
        writeMessage(error(null, ErrorCodes.PARSE_ERROR, 'Invalid JSON-RPC message'));
        continue;
      }

      await daemon.handleRequest(request as any);
    }
  }
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});