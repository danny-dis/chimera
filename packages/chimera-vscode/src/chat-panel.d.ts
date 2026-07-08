import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';
interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}
export declare class ChatPanel {
    static current: ChatPanel | undefined;
    private readonly panel;
    private readonly context;
    private readonly daemon;
    private messages;
    private isProcessing;
    private constructor();
    static createOrShow(context: vscode.ExtensionContext, daemon: DaemonClient): ChatPanel;
    addMessage(role: ChatMessage['role'], content: string): void;
    private render;
    private handleMessage;
    private processUserInput;
    private buildContext;
    private postMessage;
    private getHtml;
    private renderMessage;
    private escapeHtml;
    private getCssVariable;
}
export {};
//# sourceMappingURL=chat-panel.d.ts.map