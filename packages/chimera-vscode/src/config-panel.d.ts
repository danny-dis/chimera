import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';
export declare class ConfigPanel {
    static current: ConfigPanel | undefined;
    private readonly panel;
    private readonly context;
    private readonly daemon;
    private constructor();
    static createOrShow(context: vscode.ExtensionContext, daemon: DaemonClient): ConfigPanel;
    private render;
    private handleMessage;
    private saveConfig;
    private getEnvKeyName;
    private getHtml;
}
//# sourceMappingURL=config-panel.d.ts.map