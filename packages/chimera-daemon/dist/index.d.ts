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
/** Run the JSON-RPC 2.0 read/dispatch loop over process stdio.
 *  Shared by the standalone daemon and `chimera --mode rpc`. */
export declare function runStdioServer(daemon: ChimeraDaemon): Promise<void>;
//# sourceMappingURL=index.d.ts.map