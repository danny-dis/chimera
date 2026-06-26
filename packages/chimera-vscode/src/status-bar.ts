// ---------------------------------------------------------------------------
// StatusBarManager — VS Code status bar items for Chimera
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';

export class StatusBarManager {
  private daemonStatus: vscode.StatusBarItem;
  private modeStatus: vscode.StatusBarItem;
  private costStatus: vscode.StatusBarItem;
  private updateInterval: NodeJS.Timeout | undefined;

  constructor(private daemon: DaemonClient) {
    this.daemonStatus = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.daemonStatus.command = 'chimera.startDaemon';
    this.daemonStatus.tooltip = 'Click to start Chimera daemon';

    this.modeStatus = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99,
    );
    this.modeStatus.command = 'chimera.openChat';
    this.modeStatus.tooltip = 'Open Chimera Chat';

    this.costStatus = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.costStatus.command = 'chimera.showCost';
    this.costStatus.tooltip = 'View Chimera cost report';
  }

  start(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.update();
    this.daemonStatus.show();
    this.modeStatus.show();
    this.costStatus.show();

    // Poll health every 30s
    this.updateInterval = setInterval(() => this.update(), 30000);
  }

  dispose(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.daemonStatus.dispose();
    this.modeStatus.dispose();
    this.costStatus.dispose();
  }

  private async update(): Promise<void> {
    // Daemon status
    if (this.daemon.isReady) {
      this.daemonStatus.text = '$(check) Chimera';
      this.daemonStatus.backgroundColor = undefined;
      this.daemonStatus.command = 'chimera.stopDaemon';
      this.daemonStatus.tooltip = 'Chimera daemon is running. Click to stop.';

      // Try to get cost from daemon
      try {
        const health = await this.daemon.call<{ activeWorkers: number }>('check_health');

        if (health.activeWorkers > 0) {
          this.modeStatus.text = `$(loading~spin) ${health.activeWorkers} agent(s)`;
          this.modeStatus.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.warningBackground',
          );
        } else {
          this.modeStatus.text = '$(comment-discussion) Chimera';
          this.modeStatus.backgroundColor = undefined;
        }

        // Cost status
        try {
          const cost = await this.daemon.call<{ total: number }>('get_cost');
          this.costStatus.text = `$(graph) $${cost.total.toFixed(4)}`;
        } catch {
          this.costStatus.text = '$(graph) $0.00';
        }
      } catch {
        this.modeStatus.text = '$(debug-disconnect) Daemon error';
        this.modeStatus.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground',
        );
      }
    } else {
      this.daemonStatus.text = '$(debug-disconnect) Chimera (stopped)';
      this.daemonStatus.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground',
      );
      this.daemonStatus.command = 'chimera.startDaemon';
      this.daemonStatus.tooltip = 'Chimera daemon is not running. Click to start.';
      this.modeStatus.text = '';
      this.costStatus.text = '';
    }
  }
}