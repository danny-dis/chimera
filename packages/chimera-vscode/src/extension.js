"use strict";
// ---------------------------------------------------------------------------
// Chimera VS Code Extension — Main Entry Point
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const daemon_client_1 = require("./daemon-client");
const chat_panel_1 = require("./chat-panel");
const config_panel_1 = require("./config-panel");
const status_bar_1 = require("./status-bar");
let daemon;
let statusBar;
function activate(context) {
    console.log('[chimera] Activating extension...');
    // Create daemon client
    daemon = new daemon_client_1.DaemonClient(context);
    // Create status bar
    statusBar = new status_bar_1.StatusBarManager(daemon);
    context.subscriptions.push({
        dispose: () => statusBar?.dispose(),
    });
    // Auto-start daemon if configured
    const autoStart = vscode.workspace
        .getConfiguration('chimera')
        .get('autoStartDaemon', true);
    if (autoStart) {
        daemon.start().then(() => {
            statusBar?.start();
        });
    }
    else {
        statusBar?.start();
    }
    // -----------------------------------------------------------------------
    // Register commands
    // -----------------------------------------------------------------------
    context.subscriptions.push(vscode.commands.registerCommand('chimera.openChat', () => {
        if (!requireDaemon())
            return;
        chat_panel_1.ChatPanel.createOrShow(context, daemon);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.ask', async () => {
        if (!(await ensureDaemon()))
            return;
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        const userInput = await vscode.window.showInputBox({
            prompt: 'Ask Chimera a question',
            placeHolder: 'e.g., How does the auth flow work?',
            ignoreFocusOut: true,
        });
        if (userInput) {
            panel.addMessage('user', userInput);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.code', async () => {
        if (!(await ensureDaemon()))
            return;
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        const userInput = await vscode.window.showInputBox({
            prompt: 'Describe the code to implement',
            placeHolder: 'e.g., Add a rate limiter middleware',
            ignoreFocusOut: true,
        });
        if (userInput) {
            panel.addMessage('user', `/code ${userInput}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.plan', async () => {
        if (!(await ensureDaemon()))
            return;
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        const userInput = await vscode.window.showInputBox({
            prompt: 'Describe what you want to plan',
            placeHolder: 'e.g., Plan the implementation of a user auth module',
            ignoreFocusOut: true,
        });
        if (userInput) {
            panel.addMessage('user', `/plan ${userInput}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.review', async () => {
        if (!(await ensureDaemon()))
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No editor active. Select code to review.');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showWarningMessage('Select code to review.');
            return;
        }
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        panel.addMessage('user', `/review Review the following code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.debug', async () => {
        if (!(await ensureDaemon()))
            return;
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        const userInput = await vscode.window.showInputBox({
            prompt: 'Describe the bug or issue',
            placeHolder: 'e.g., The login endpoint returns 500 when password is empty',
            ignoreFocusOut: true,
        });
        if (userInput) {
            panel.addMessage('user', `/debug ${userInput}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.explain', () => {
        if (!requireDaemon())
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to explain.');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        panel.addMessage('user', `/explain Explain this code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.fix', () => {
        if (!requireDaemon())
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to fix.');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        const panel = chat_panel_1.ChatPanel.createOrShow(context, daemon);
        panel.addMessage('user', `/code Fix any issues in this code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.toggleAgentDashboard', async () => {
        if (!requireDaemon())
            return;
        vscode.window.showInformationMessage('Agent Dashboard is available when tasks are running.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.showCost', async () => {
        if (!daemon?.isReady) {
            vscode.window.showWarningMessage('Chimera daemon is not running.');
            return;
        }
        try {
            const cost = await daemon.call('get_cost');
            const lines = ['## Chimera Cost Report', ''];
            lines.push(`**Total Cost:** $${cost.total.toFixed(4)}`);
            lines.push('');
            lines.push('| Provider | Spend | Budget |');
            lines.push('|----------|-------|--------|');
            for (const [provider, spend] of Object.entries(cost.byProvider)) {
                const budget = cost.budgetPerProvider[provider];
                const budgetStr = budget
                    ? `$${budget.perSession.toFixed(2)}/session`
                    : 'unlimited';
                lines.push(`| ${provider} | $${spend.toFixed(4)} | ${budgetStr} |`);
            }
            const doc = await vscode.workspace.openTextDocument({
                content: lines.join('\n'),
                language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to get cost: ${err instanceof Error ? err.message : String(err)}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.setupConfig', () => {
        if (!requireDaemon())
            return;
        config_panel_1.ConfigPanel.createOrShow(context, daemon);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.startDaemon', async () => {
        if (!requireDaemon())
            return;
        try {
            await daemon.start();
            statusBar?.start();
            vscode.window.showInformationMessage('Chimera daemon started.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.stopDaemon', () => {
        if (!requireDaemon())
            return;
        daemon.stop();
        vscode.window.showInformationMessage('Chimera daemon stopped.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('chimera.restartDaemon', async () => {
        if (!requireDaemon())
            return;
        try {
            await daemon.restart();
            vscode.window.showInformationMessage('Chimera daemon restarted.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to restart daemon: ${err instanceof Error ? err.message : String(err)}`);
        }
    }));
    // -----------------------------------------------------------------------
    // File change notifications
    // -----------------------------------------------------------------------
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidChange((uri) => {
        if (daemon?.isReady) {
            daemon.call('file_changed', { path: uri.fsPath, type: 'changed' }).catch(() => { });
        }
    });
    fileWatcher.onDidCreate((uri) => {
        if (daemon?.isReady) {
            daemon.call('file_changed', { path: uri.fsPath, type: 'created' }).catch(() => { });
        }
    });
    fileWatcher.onDidDelete((uri) => {
        if (daemon?.isReady) {
            daemon.call('file_changed', { path: uri.fsPath, type: 'deleted' }).catch(() => { });
        }
    });
    context.subscriptions.push(fileWatcher);
    console.log('[chimera] Extension activated successfully.');
}
function deactivate() {
    console.log('[chimera] Deactivating extension...');
    daemon?.stop();
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function requireDaemon() {
    if (!daemon?.isReady) {
        vscode.window.showWarningMessage('Chimera daemon is not running. Start it with: Chimera: Start Daemon');
        return false;
    }
    return true;
}
async function ensureDaemon() {
    if (daemon?.isReady)
        return true;
    try {
        await daemon?.start();
        if (daemon) {
            await daemon.waitForReady();
            return true;
        }
    }
    catch {
        vscode.window.showWarningMessage('Chimera daemon is starting. Please try again in a moment.');
    }
    return false;
}
//# sourceMappingURL=extension.js.map