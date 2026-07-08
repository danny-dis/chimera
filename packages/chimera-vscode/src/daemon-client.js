"use strict";
// ---------------------------------------------------------------------------
// DaemonClient — manages the chimera-daemon subprocess and JSON-RPC calls
// ---------------------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaemonClient = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DaemonClient {
    process = null;
    buffer = '';
    pending = new Map();
    requestId = 0;
    ready = false;
    readyPromise;
    resolveReady;
    onEvent = null;
    outputChannel;
    workspaceRoot;
    constructor(context) {
        this.outputChannel = vscode.window.createOutputChannel('Chimera Daemon');
        this.workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
        this.readyPromise = new Promise((resolve) => {
            this.resolveReady = resolve;
        });
        context.subscriptions.push(this.outputChannel);
    }
    setEventHandler(handler) {
        this.onEvent = handler;
    }
    async waitForReady(timeoutMs = 15000) {
        if (this.ready)
            return;
        return Promise.race([
            this.readyPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Daemon startup timed out')), timeoutMs)),
        ]);
    }
    get isReady() {
        return this.ready;
    }
    async start() {
        if (this.process) {
            this.log('Daemon already running');
            return;
        }
        // Reset ready state for the new process
        this.ready = false;
        this.readyPromise = new Promise((resolve) => {
            this.resolveReady = resolve;
        });
        this.buffer = '';
        // Resolve daemon path
        let daemonPath = vscode.workspace
            .getConfiguration('chimera')
            .get('daemonPath', '');
        if (!daemonPath) {
            // Find the daemon in the monorepo
            const possiblePaths = [
                path.join(this.workspaceRoot, 'node_modules', '@chimera', 'daemon', 'dist', 'index.js'),
                path.join(this.workspaceRoot, '..', 'chimera-daemon', 'dist', 'index.js'),
                path.join(this.workspaceRoot, 'packages', 'chimera-daemon', 'dist', 'index.js'),
            ];
            // Also look in common parent directories
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    daemonPath = p;
                    break;
                }
            }
            // Last resort: check if chimera is in a parent folder
            if (!daemonPath) {
                let dir = path.dirname(this.workspaceRoot);
                while (dir !== path.dirname(dir)) {
                    const candidate = path.join(dir, 'chimera', 'packages', 'chimera-daemon', 'dist', 'index.js');
                    if (fs.existsSync(candidate)) {
                        daemonPath = candidate;
                        break;
                    }
                    dir = path.dirname(dir);
                }
            }
        }
        if (!daemonPath || !fs.existsSync(daemonPath)) {
            this.log('Daemon not found. Build it with: pnpm --filter @chimera/daemon build');
            vscode.window.showWarningMessage('Chimera daemon not found. Please build it first: pnpm --filter @chimera/daemon build');
            return;
        }
        this.log(`Starting daemon from: ${daemonPath}`);
        this.process = (0, child_process_1.spawn)('node', [daemonPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });
        // Handle stdout (JSON-RPC responses and notifications)
        this.process.stdout?.on('data', (chunk) => {
            this.buffer += chunk.toString();
            this.processBuffer();
        });
        // Handle stderr (logs from daemon)
        this.process.stderr?.on('data', (chunk) => {
            const text = chunk.toString().trim();
            if (text) {
                this.log(text);
            }
        });
        // Handle exit
        this.process.on('exit', (code, signal) => {
            this.log(`Daemon exited (code: ${code}, signal: ${signal})`);
            this.process = null;
            this.ready = false;
            // Reject all pending requests
            for (const [id, pending] of this.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`Daemon exited (code: ${code})`));
            }
            this.pending.clear();
        });
        this.process.on('error', (err) => {
            this.log(`Daemon error: ${err.message}`);
        });
    }
    stop() {
        if (this.process) {
            this.log('Stopping daemon');
            this.process.stdin?.end();
            this.process.kill('SIGTERM');
            // Reject pending requests immediately
            for (const [id, pending] of this.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Daemon stopped by user'));
            }
            this.pending.clear();
            this.process = null;
            this.ready = false;
            this.buffer = '';
        }
    }
    restart() {
        this.stop();
        return this.start();
    }
    async call(method, params) {
        if (!this.process?.stdin?.writable) {
            throw new Error('Daemon not running');
        }
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request timed out: ${method}`));
            }, 30000); // 30s timeout
            this.pending.set(id, { resolve: resolve, reject, timer });
            const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
            this.process.stdin.write(request);
        });
    }
    processBuffer() {
        let newlineIdx;
        while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, newlineIdx).trim();
            this.buffer = this.buffer.slice(newlineIdx + 1);
            if (!line)
                continue;
            try {
                const msg = JSON.parse(line);
                // Handle notifications (server → client events)
                if (msg.method === 'ready' && msg.jsonrpc === '2.0') {
                    this.ready = true;
                    this.log('Daemon ready');
                    this.resolveReady();
                    continue;
                }
                if (msg.method === 'event' && msg.jsonrpc === '2.0') {
                    this.onEvent?.('event', msg.params);
                    continue;
                }
                // Handle responses
                if (msg.jsonrpc === '2.0' && msg.id != null) {
                    const pending = this.pending.get(msg.id);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pending.delete(msg.id);
                        if (msg.error) {
                            pending.reject(new Error(msg.error.message));
                        }
                        else {
                            pending.resolve(msg.result);
                        }
                    }
                }
            }
            catch (err) {
                this.log(`Failed to parse daemon output: ${line}`);
            }
        }
    }
    log(message) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
}
exports.DaemonClient = DaemonClient;
//# sourceMappingURL=daemon-client.js.map