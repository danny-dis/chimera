"use strict";
// ---------------------------------------------------------------------------
// Chimera daemon — JSON-RPC 2.0 server over stdio
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChimeraDaemon = void 0;
const path_1 = __importDefault(require("path"));
const core_1 = require("@chimera/core");
const bootstrap_js_1 = require("./bootstrap.js");
const json_rpc_js_1 = require("./json-rpc.js");
const configLoader = __importStar(require("./config-loader.js"));
class ChimeraDaemon {
    workers = new Map();
    workerCounter = 0;
    startTime = Date.now();
    eventStream;
    activeSubscriptions = new Map();
    constructor() {
        this.eventStream = new core_1.EventStream();
    }
    getEventStream() {
        return this.eventStream;
    }
    async handleRequest(request) {
        const { id, method, params } = request;
        try {
            switch (method) {
                case 'ping':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, 'pong'));
                case 'execute_task':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, await this.executeTask(params)));
                case 'get_state':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.getState()));
                case 'list_agents':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.listAgents()));
                case 'get_config':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.getConfig(params)));
                case 'save_config':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.saveConfig(params)));
                case 'get_cost':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.getCost()));
                case 'check_health':
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, this.checkHealth()));
                case 'stream_events':
                    return this.streamEvents(id);
                default:
                    return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.error)(id, json_rpc_js_1.ErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`));
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.error)(id, json_rpc_js_1.ErrorCodes.INTERNAL_ERROR, msg));
        }
    }
    // -----------------------------------------------------------------------
    // Methods
    // -----------------------------------------------------------------------
    validateWorkspaceRoot(root) {
        const resolved = path_1.default.resolve(root);
        if (resolved.includes('..')) {
            throw new Error('Invalid workspace root: path traversal detected');
        }
        return resolved;
    }
    async executeTask(raw) {
        const { task, mode = 'code', workspaceRoot: rawRoot } = raw;
        const workspaceRoot = this.validateWorkspaceRoot(rawRoot);
        // Load config for the workspace, auto-generate from env vars if missing
        let cfg = configLoader.loadConfig(workspaceRoot);
        if (!cfg) {
            cfg = await configLoader.autoGenerateConfig(workspaceRoot);
            if (!cfg) {
                throw new Error('No .chimera/config.yaml found and no API keys in environment. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.');
            }
        }
        // Bootstrap chimera
        const { workflowRegistry } = (0, bootstrap_js_1.bootstrap)();
        // Create orchestrator
        const orchestrator = new core_1.SessionOrchestrator(this.eventStream, undefined, workspaceRoot);
        // Create worker record
        const workerId = `worker-${++this.workerCounter}`;
        const worker = {
            id: workerId,
            task,
            mode,
            startedAt: Date.now(),
            orchestrator,
        };
        this.workers.set(workerId, worker);
        try {
            // Execute the task via orchestrator
            const result = await orchestrator.executeWorkflow(task, {
                writer: { complete: async (messages) => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } }) },
            });
            // Get final state
            const state = orchestrator.getState();
            const costTracker = orchestrator.getCostTracker();
            const totalCost = Array.from(cfg.providers).reduce((acc, p) => acc + costTracker.getSpend(p.name), 0);
            return {
                status: state.status === 'complete' ? 'done' : state.status === 'error' ? 'error' : 'blocked',
                output: state.status === 'complete' ? state.result : state.error || '',
                cost: totalCost,
                agentCount: this.workers.size,
                events: [...this.eventStream.getAll()],
            };
        }
        finally {
            this.workers.delete(workerId);
        }
    }
    getState() {
        const costTracker = Array.from(this.workers.values())[0]?.orchestrator.getCostTracker();
        const cost = {};
        if (costTracker) {
            // Collect cost from all providers
            const allEvents = this.eventStream.getAll();
            for (const evt of allEvents) {
                if (evt.type === 'agent_spawned') {
                    if (!cost[evt.provider])
                        cost[evt.provider] = 0;
                }
            }
        }
        return {
            status: this.workers.size > 0 ? 'running' : 'idle',
            cost,
            events: this.eventStream.getAll().slice(-50), // last 50 events
            hidden: this.eventStream.getAll().length,
        };
    }
    listAgents() {
        const agents = [];
        const allEvents = this.eventStream.getAll();
        for (const evt of allEvents) {
            if (evt.type === 'agent_spawned') {
                agents.push({
                    id: evt.agentId,
                    role: evt.role,
                    provider: evt.provider,
                    model: evt.model,
                });
            }
        }
        return { agents };
    }
    getConfig(raw) {
        const cfg = configLoader.loadConfig(raw.workspaceRoot);
        return {
            configured: cfg !== null,
            providers: cfg?.providers ?? [],
        };
    }
    saveConfig(raw) {
        if (!raw.workspaceRoot || typeof raw.workspaceRoot !== 'string') {
            return { ok: false, error: 'Invalid workspaceRoot' };
        }
        if (raw.config === null || raw.config === undefined || typeof raw.config !== 'object') {
            return { ok: false, error: 'Config must be a non-null object' };
        }
        try {
            configLoader.saveConfig(raw.config, raw.workspaceRoot);
            return { ok: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, error: msg };
        }
    }
    getCost() {
        const workers = Array.from(this.workers.values());
        const byProvider = {};
        const budgetPerProvider = {};
        let total = 0;
        if (workers.length > 0) {
            const costTracker = workers[0].orchestrator.getCostTracker();
            if (costTracker) {
                const allEvents = this.eventStream.getAll();
                for (const evt of allEvents) {
                    if (evt.type === 'agent_spawned') {
                        const spend = costTracker.getSpend(evt.provider);
                        if (!byProvider[evt.provider])
                            byProvider[evt.provider] = 0;
                        byProvider[evt.provider] += spend;
                        total += spend;
                    }
                }
            }
        }
        return { total, byProvider, budgetPerProvider };
    }
    checkHealth() {
        return {
            status: 'ok',
            version: '0.0.1',
            uptime: Date.now() - this.startTime,
            activeWorkers: this.workers.size,
        };
    }
    async streamEvents(id) {
        const idStr = String(id);
        const unsubscribe = this.eventStream.subscribe('*', (event) => {
            (0, json_rpc_js_1.writeMessage)({
                jsonrpc: '2.0',
                method: 'event',
                params: { event },
            });
        });
        this.activeSubscriptions.set(idStr, unsubscribe);
        (0, json_rpc_js_1.writeMessage)((0, json_rpc_js_1.success)(id, { streaming: true }));
    }
    cleanupSubscription(id) {
        const unsub = this.activeSubscriptions.get(id);
        if (unsub) {
            unsub();
            this.activeSubscriptions.delete(id);
        }
    }
    dispose() {
        for (const [id] of this.activeSubscriptions) {
            this.cleanupSubscription(id);
        }
    }
    cleanupSubscriptions() {
        this.dispose();
    }
}
exports.ChimeraDaemon = ChimeraDaemon;
//# sourceMappingURL=server.js.map