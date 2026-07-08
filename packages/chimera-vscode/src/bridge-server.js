"use strict";
/**
 * BridgeServer — HTTP server for IDE ↔ Chimera communication.
 *
 * Provides REST endpoints for session creation, message passing,
 * and file change notifications. Alternative to the stdio-based
 * DaemonClient for tools that prefer HTTP.
 *
 * Endpoints:
 *   POST /session          — create a new session
 *   POST /session/:id/send — send a message to a session
 *   GET  /session/:id      — get session status
 *   POST /file-changed     — notify about file changes
 *   GET  /health           — health check
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeServer = void 0;
const http_1 = require("http");
class BridgeServer {
    server = null;
    config;
    sessions = new Map();
    taskHandler;
    fileChangeNotifications = [];
    maxNotifications = 100;
    constructor(config, taskHandler) {
        this.config = config;
        this.taskHandler = taskHandler;
    }
    async start() {
        return new Promise((resolve, reject) => {
            this.server = (0, http_1.createServer)((req, res) => this.handleRequest(req, res));
            this.server.listen(this.config.port, this.config.host ?? '127.0.0.1', () => {
                resolve();
            });
            this.server.on('error', reject);
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
                this.server = null;
            }
            else {
                resolve();
            }
        });
    }
    getPort() {
        return this.config.port;
    }
    isRunning() {
        return this.server !== null;
    }
    async handleRequest(req, res) {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const path = url.pathname;
        const method = req.method ?? 'GET';
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            if (path === '/health' && method === 'GET') {
                this.json(res, 200, { status: 'ok', sessions: this.sessions.size });
            }
            else if (path === '/session' && method === 'POST') {
                const body = await this.readBody(req);
                const session = this.createSession(body.mode ?? 'ask', body.workspaceRoot ?? process.cwd());
                this.json(res, 201, { sessionId: session.id, status: session.status });
            }
            else if (path.startsWith('/session/') && path.endsWith('/send') && method === 'POST') {
                const sessionId = path.split('/')[2];
                const session = this.sessions.get(sessionId);
                if (!session) {
                    this.json(res, 404, { error: 'Session not found' });
                    return;
                }
                const body = await this.readBody(req);
                session.messages.push({ role: 'user', content: body.task, timestamp: Date.now() });
                const result = await this.taskHandler({
                    task: body.task,
                    mode: session.mode,
                    workspaceRoot: session.workspaceRoot,
                    sessionId: session.id,
                });
                session.messages.push({ role: 'assistant', content: result.output, timestamp: Date.now() });
                session.status = result.status === 'done' ? 'completed' : 'failed';
                this.json(res, 200, result);
            }
            else if (path.startsWith('/session/') && method === 'GET') {
                const sessionId = path.split('/')[2];
                const session = this.sessions.get(sessionId);
                if (!session) {
                    this.json(res, 404, { error: 'Session not found' });
                    return;
                }
                this.json(res, 200, { id: session.id, mode: session.mode, status: session.status, messageCount: session.messages.length });
            }
            else if (path === '/file-changed' && method === 'POST') {
                const body = await this.readBody(req);
                this.fileChangeNotifications.push({ path: body.path, type: body.type, timestamp: Date.now() });
                if (this.fileChangeNotifications.length > this.maxNotifications) {
                    this.fileChangeNotifications = this.fileChangeNotifications.slice(-this.maxNotifications);
                }
                this.json(res, 200, { ok: true });
            }
            else {
                this.json(res, 404, { error: 'Not found' });
            }
        }
        catch (err) {
            this.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
    }
    createSession(mode, workspaceRoot) {
        const id = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const session = {
            id,
            mode,
            workspaceRoot,
            messages: [],
            status: 'active',
            createdAt: Date.now(),
        };
        this.sessions.set(id, session);
        return session;
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString()));
                }
                catch {
                    resolve({});
                }
            });
            req.on('error', reject);
        });
    }
    json(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
}
exports.BridgeServer = BridgeServer;
//# sourceMappingURL=bridge-server.js.map