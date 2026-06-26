// ---------------------------------------------------------------------------
// Chimera VS Code Extension — Main Entry Point
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';
import { ChatPanel } from './chat-panel';
import { ConfigPanel } from './config-panel';
import { StatusBarManager } from './status-bar';

let daemon: DaemonClient | undefined;
let statusBar: StatusBarManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[chimera] Activating extension...');

  // Create daemon client
  daemon = new DaemonClient(context);

  // Create status bar
  statusBar = new StatusBarManager(daemon);
  context.subscriptions.push({
    dispose: () => statusBar?.dispose(),
  });

  // Auto-start daemon if configured
  const autoStart = vscode.workspace
    .getConfiguration('chimera')
    .get<boolean>('autoStartDaemon', true);
  if (autoStart) {
    daemon.start().then(() => {
      statusBar?.start();
    });
  } else {
    statusBar?.start();
  }

  // -----------------------------------------------------------------------
  // Register commands
  // -----------------------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.openChat', () => {
      if (!requireDaemon()) return;
      ChatPanel.createOrShow(context, daemon!);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.ask', async () => {
      if (!(await ensureDaemon())) return;

      const panel = ChatPanel.createOrShow(context, daemon!);
      const userInput = await vscode.window.showInputBox({
        prompt: 'Ask Chimera a question',
        placeHolder: 'e.g., How does the auth flow work?',
        ignoreFocusOut: true,
      });
      if (userInput) {
        panel.addMessage('user', userInput);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.code', async () => {
      if (!(await ensureDaemon())) return;

      const panel = ChatPanel.createOrShow(context, daemon!);
      const userInput = await vscode.window.showInputBox({
        prompt: 'Describe the code to implement',
        placeHolder: 'e.g., Add a rate limiter middleware',
        ignoreFocusOut: true,
      });
      if (userInput) {
        panel.addMessage('user', `/code ${userInput}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.plan', async () => {
      if (!(await ensureDaemon())) return;

      const panel = ChatPanel.createOrShow(context, daemon!);
      const userInput = await vscode.window.showInputBox({
        prompt: 'Describe what you want to plan',
        placeHolder: 'e.g., Plan the implementation of a user auth module',
        ignoreFocusOut: true,
      });
      if (userInput) {
        panel.addMessage('user', `/plan ${userInput}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.review', async () => {
      if (!(await ensureDaemon())) return;

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

      const panel = ChatPanel.createOrShow(context, daemon!);
      panel.addMessage('user', `/review Review the following code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.debug', async () => {
      if (!(await ensureDaemon())) return;

      const panel = ChatPanel.createOrShow(context, daemon!);
      const userInput = await vscode.window.showInputBox({
        prompt: 'Describe the bug or issue',
        placeHolder: 'e.g., The login endpoint returns 500 when password is empty',
        ignoreFocusOut: true,
      });
      if (userInput) {
        panel.addMessage('user', `/debug ${userInput}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.explain', () => {
      if (!requireDaemon()) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select code to explain.');
        return;
      }
      const selection = editor.document.getText(editor.selection);
      const panel = ChatPanel.createOrShow(context, daemon!);
      panel.addMessage('user', `/explain Explain this code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.fix', () => {
      if (!requireDaemon()) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Select code to fix.');
        return;
      }
      const selection = editor.document.getText(editor.selection);
      const panel = ChatPanel.createOrShow(context, daemon!);
      panel.addMessage(
        'user',
        `/code Fix any issues in this code:\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.toggleAgentDashboard', async () => {
      if (!requireDaemon()) return;
      vscode.window.showInformationMessage(
        'Agent Dashboard is available when tasks are running.',
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.showCost', async () => {
      if (!daemon?.isReady) {
        vscode.window.showWarningMessage('Chimera daemon is not running.');
        return;
      }
      try {
        const cost = await daemon.call<{
          total: number;
          byProvider: Record<string, number>;
          budgetPerProvider: Record<string, { perTask: number; perSession: number; perDay: number }>;
        }>('get_cost');

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
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to get cost: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.setupConfig', () => {
      if (!requireDaemon()) return;
      ConfigPanel.createOrShow(context, daemon!);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.startDaemon', async () => {
      if (!requireDaemon()) return;
      try {
        await daemon!.start();
        statusBar?.start();
        vscode.window.showInformationMessage('Chimera daemon started.');
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.stopDaemon', () => {
      if (!requireDaemon()) return;
      daemon!.stop();
      vscode.window.showInformationMessage('Chimera daemon stopped.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('chimera.restartDaemon', async () => {
      if (!requireDaemon()) return;
      try {
        await daemon!.restart();
        vscode.window.showInformationMessage('Chimera daemon restarted.');
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to restart daemon: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  console.log('[chimera] Extension activated successfully.');
}

export function deactivate(): void {
  console.log('[chimera] Deactivating extension...');
  daemon?.stop();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireDaemon(): boolean {
  if (!daemon?.isReady) {
    vscode.window.showWarningMessage('Chimera daemon is not running. Start it with: Chimera: Start Daemon');
    return false;
  }
  return true;
}

async function ensureDaemon(): Promise<boolean> {
  if (daemon?.isReady) return true;

  try {
    await daemon?.start();
    if (daemon) {
      await daemon.waitForReady();
      return true;
    }
  } catch {
    vscode.window.showWarningMessage(
      'Chimera daemon is starting. Please try again in a moment.',
    );
  }
  return false;
}