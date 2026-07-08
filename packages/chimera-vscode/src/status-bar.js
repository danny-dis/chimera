"use strict";
// ---------------------------------------------------------------------------
// StatusBarManager — VS Code status bar items for Chimera
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
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class StatusBarManager {
    daemon;
    daemonStatus;
    modeStatus;
    costStatus;
    updateInterval;
    constructor(daemon) {
        this.daemon = daemon;
        this.daemonStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.daemonStatus.command = 'chimera.startDaemon';
        this.daemonStatus.tooltip = 'Click to start Chimera daemon';
        this.modeStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.modeStatus.command = 'chimera.openChat';
        this.modeStatus.tooltip = 'Open Chimera Chat';
        this.costStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.costStatus.command = 'chimera.showCost';
        this.costStatus.tooltip = 'View Chimera cost report';
    }
    start() {
        if (this.updateInterval)
            clearInterval(this.updateInterval);
        this.update();
        this.daemonStatus.show();
        this.modeStatus.show();
        this.costStatus.show();
        // Poll health every 30s
        this.updateInterval = setInterval(() => this.update(), 30000);
    }
    dispose() {
        if (this.updateInterval)
            clearInterval(this.updateInterval);
        this.daemonStatus.dispose();
        this.modeStatus.dispose();
        this.costStatus.dispose();
    }
    async update() {
        // Daemon status
        if (this.daemon.isReady) {
            this.daemonStatus.text = '$(check) Chimera';
            this.daemonStatus.backgroundColor = undefined;
            this.daemonStatus.command = 'chimera.stopDaemon';
            this.daemonStatus.tooltip = 'Chimera daemon is running. Click to stop.';
            // Try to get cost from daemon
            try {
                const health = await this.daemon.call('check_health');
                if (health.activeWorkers > 0) {
                    this.modeStatus.text = `$(loading~spin) ${health.activeWorkers} agent(s)`;
                    this.modeStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                }
                else {
                    this.modeStatus.text = '$(comment-discussion) Chimera';
                    this.modeStatus.backgroundColor = undefined;
                }
                // Cost status
                try {
                    const cost = await this.daemon.call('get_cost');
                    this.costStatus.text = `$(graph) $${cost.total.toFixed(4)}`;
                }
                catch {
                    this.costStatus.text = '$(graph) $0.00';
                }
            }
            catch {
                this.modeStatus.text = '$(debug-disconnect) Daemon error';
                this.modeStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            }
        }
        else {
            this.daemonStatus.text = '$(debug-disconnect) Chimera (stopped)';
            this.daemonStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.daemonStatus.command = 'chimera.startDaemon';
            this.daemonStatus.tooltip = 'Chimera daemon is not running. Click to start.';
            this.modeStatus.text = '';
            this.costStatus.text = '';
        }
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=status-bar.js.map