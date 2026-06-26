// ---------------------------------------------------------------------------
// ChatPanel — the main chat WebView for interacting with Chimera
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export class ChatPanel {
  public static current: ChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly daemon: DaemonClient;
  private messages: ChatMessage[] = [];
  private isProcessing = false;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    daemon: DaemonClient,
  ) {
    this.panel = panel;
    this.context = context;
    this.daemon = daemon;
    this.panel.onDidDispose(() => {
      ChatPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
    this.render();
  }

  static createOrShow(context: vscode.ExtensionContext, daemon: DaemonClient): ChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ChatPanel.current) {
      ChatPanel.current.panel.reveal(column);
      return ChatPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'chimeraChat',
      'Chimera AI',
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      },
    );

    ChatPanel.current = new ChatPanel(panel, context, daemon);
    return ChatPanel.current;
  }

  addMessage(role: ChatMessage['role'], content: string): void {
    this.messages.push({ role, content, timestamp: Date.now() });
    this.render();

    // Keep within configured limit
    const maxLines = vscode.workspace
      .getConfiguration('chimera')
      .get<number>('maxOutputLines', 500);
    if (this.messages.length > maxLines) {
      this.messages = this.messages.slice(-maxLines);
    }
  }

  private render(): void {
    this.panel.webview.html = this.getHtml();
  }

  private async handleMessage(message: { type: string; text?: string }): Promise<void> {
    switch (message.type) {
      case 'send':
        if (message.text) {
          await this.processUserInput(message.text);
        }
        break;

      case 'clear':
        this.messages = [];
        this.render();
        break;

      case 'copy':
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
        }
        break;
    }
  }

  private async processUserInput(text: string): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.addMessage('user', text);

    // Detect mode from prefix
    let mode = 'ask';
    if (text.startsWith('/code ') || text.startsWith('/c ')) {
      mode = 'code';
      text = text.replace(/^\/(code|c)\s+/, '');
    } else if (text.startsWith('/plan ') || text.startsWith('/p ')) {
      mode = 'plan';
      text = text.replace(/^\/(plan|p)\s+/, '');
    } else if (text.startsWith('/review ') || text.startsWith('/r ')) {
      mode = 'review';
      text = text.replace(/^\/(review|r)\s+/, '');
    } else if (text.startsWith('/debug ') || text.startsWith('/d ')) {
      mode = 'debug';
      text = text.replace(/^\/(debug|d)\s+/, '');
    } else if (text.startsWith('/ask ') || text.startsWith('/a ')) {
      mode = 'ask';
      text = text.replace(/^\/(ask|a)\s+/, '');
    } else if (text.startsWith('/auto ')) {
      mode = 'auto';
      text = text.replace(/^\/auto\s+/, '');
    }

    try {
      // Send processing indicator
      this.postMessage({ type: 'processing', mode });

      // Get selected text for context
      const editor = vscode.window.activeTextEditor;
      let selectionText = '';
      let filePath = '';
      if (editor) {
        filePath = editor.document.uri.fsPath;
        const selection = editor.selection;
        if (!selection.isEmpty) {
          selectionText = editor.document.getText(selection);
        }
      }

      // Build context package
      const contextMessage = this.buildContext(text, filePath, selectionText);

      // Send to daemon
      const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();

      const result = await this.daemon.call<{
        status: string;
        output: string;
        cost: number;
        agentCount: number;
        events: unknown[];
      }>('execute_task', {
        task: contextMessage,
        mode,
        workspaceRoot,
      });

      this.addMessage('assistant', result.output);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.addMessage('system', `⚠ **Error**: ${errorMsg}`);
    } finally {
      this.isProcessing = false;
      this.postMessage({ type: 'done' });
    }
  }

  private buildContext(
    userMessage: string,
    filePath: string,
    selectionText: string,
  ): string {
    let context = userMessage;

    if (filePath) {
      context = `[File: \`${filePath}\`]\n${context}`;
    }

    if (selectionText) {
      context = `\`\`\`\n${selectionText.slice(0, 4000)}\n\`\`\`\n${context}`;
    }

    return context;
  }

  private postMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const fontSize = vscode.workspace
      .getConfiguration('chimera')
      .get<number>('chatFontSize', 14);

    const messagesHtml = this.messages
      .map((msg) => this.renderMessage(msg))
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --font-size: ${fontSize}px;
      --bg: ${this.getCssVariable('editor.background', '#1e1e1e')};
      --text: ${this.getCssVariable('editor.foreground', '#d4d4d4')};
      --user-bg: ${this.getCssVariable('list.activeSelectionBackground', '#094771')};
      --assistant-bg: ${this.getCssVariable('editor.inactiveSelectionBackground', '#3a3d41')};
      --system-bg: ${this.getCssVariable('inputValidation.warningBackground', '#352a05')};
      --border: ${this.getCssVariable('panel.border', '#454545')};
      --input-bg: ${this.getCssVariable('input.background', '#3c3c3c')};
      --primary: ${this.getCssVariable('focusBorder', '#007acc')};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: var(--font-size);
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      scroll-behavior: smooth;
    }
    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-width: 95%;
    }
    .message.user {
      background: var(--user-bg);
      margin-left: 20px;
    }
    .message.assistant {
      background: var(--assistant-bg);
      margin-right: 20px;
    }
    .message.system {
      background: var(--system-bg);
      font-style: italic;
      font-size: 0.9em;
    }
    .message-header {
      font-size: 0.75em;
      opacity: 0.7;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }
    .message code {
      background: rgba(0,0,0,0.3);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }
    .message pre {
      background: rgba(0,0,0,0.3);
      padding: 8px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .message pre code {
      background: none;
      padding: 0;
    }
    #input-area {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }
    #input {
      flex: 1;
      background: var(--input-bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: var(--font-size);
      font-family: inherit;
      resize: none;
      outline: none;
    }
    #input:focus {
      border-color: var(--primary);
    }
    #send-btn {
      background: var(--vscode-button-background, var(--primary));
      color: var(--vscode-button-foreground, #fff);
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: var(--font-size);
      cursor: pointer;
      white-space: nowrap;
    }
    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #send-btn:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    .processing-indicator {
      color: var(--primary);
      font-style: italic;
      margin-bottom: 12px;
      padding: 8px 12px;
    }
    .mode-badge {
      display: inline-block;
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 4px;
      margin-right: 6px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .mode-ask { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .mode-code { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .mode-plan { background: var(--vscode-testing-iconPassed); color: var(--vscode-editor-foreground); }
    .mode-review { background: var(--vscode-charts-orange); color: var(--vscode-editor-foreground); }
    .mode-debug { background: var(--vscode-testing-iconFailed); color: var(--vscode-editor-foreground); }
    .mode-oal { background: var(--vscode-testing-iconQueued); color: var(--vscode-editor-foreground); }
    .mode-auto { background: var(--vscode-descriptionForeground); color: var(--vscode-editor-background); }
    .copy-btn {
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      font-size: 0.8em;
      padding: 0 4px;
    }
    .message:hover .copy-btn { opacity: 0.7; }
    .copy-btn:hover { opacity: 1 !important; }
    .status-bar {
      display: flex;
      gap: 12px;
      padding: 4px 16px;
      font-size: 0.75em;
      opacity: 0.6;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div id="messages">
    ${messagesHtml || '<div style="opacity:0.5;text-align:center;margin-top:40px;">Send a message to start a Chimera session</div>'}
  </div>

  <div id="input-area">
    <textarea id="input" rows="2" placeholder="/ask Ask a question, /code Start coding, /plan Plan, /review Review code, /debug Debug..." autofocus></textarea>
    <button id="send-btn" onclick="send()">Send</button>
  </div>

  <div class="status-bar" id="status-bar">
    <span id="status-text">Ready</span>
    <span id="status-cost"></span>
    <span id="status-agents"></span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      vscode.postMessage({ type: 'send', text });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'processing') {
        sendBtn.disabled = true;
        document.getElementById('status-text').textContent = 'Processing (' + msg.mode + ')...';
        document.getElementById('send-btn').textContent = '...';
      }

      if (msg.type === 'done') {
        sendBtn.disabled = false;
        document.getElementById('status-text').textContent = 'Ready';
        document.getElementById('send-btn').textContent = 'Send';
        scrollToBottom();
      }
    });

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    scrollToBottom();
  </script>
</body>
</html>`;
  }

  private renderMessage(msg: ChatMessage): string {
    const roleClass = msg.role;
    const time = new Date(msg.timestamp).toLocaleTimeString();
    const escaped = this.escapeHtml(msg.content);

    // Convert mode badges in content
    const content = escaped.replace(
      /\/(ask|code|plan|review|debug|oal)/g,
      '<span class="mode-badge mode-$1">$1</span>',
    );

    // Convert ```code blocks
    const withCodeBlocks = content.replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      '<pre><code>$2</code></pre>',
    );

    return `<div class="message ${roleClass}">
      <div class="message-header">
        <span>${roleClass === 'user' ? '🧑 You' : roleClass === 'assistant' ? '🧠 Chimera' : '⚙️ System'}</span>
        <span><span class="copy-btn" onclick="vscode.postMessage({type:'copy',text:${JSON.stringify(msg.content)}})">📋</span> ${time}</span>
      </div>
      ${withCodeBlocks}
    </div>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getCssVariable(name: string, fallback: string): string {
    // This runs in the extension host context, so we can't read CSS vars.
    // We'll return the fallback; the WebView will have VS Code's theme applied.
    return fallback;
  }
}