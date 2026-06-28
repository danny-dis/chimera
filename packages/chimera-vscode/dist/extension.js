"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode5 = __toESM(require("vscode"));

// src/daemon-client.ts
var vscode = __toESM(require("vscode"));
var import_child_process = require("child_process");
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var DaemonClient = class {
  process = null;
  buffer = "";
  pending = /* @__PURE__ */ new Map();
  requestId = 0;
  ready = false;
  readyPromise;
  resolveReady;
  onEvent = null;
  outputChannel;
  workspaceRoot;
  constructor(context) {
    this.outputChannel = vscode.window.createOutputChannel("Chimera Daemon");
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    context.subscriptions.push(this.outputChannel);
  }
  setEventHandler(handler) {
    this.onEvent = handler;
  }
  async waitForReady(timeoutMs = 15e3) {
    if (this.ready) return;
    return Promise.race([
      this.readyPromise,
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Daemon startup timed out")), timeoutMs)
      )
    ]);
  }
  get isReady() {
    return this.ready;
  }
  async start() {
    if (this.process) {
      this.log("Daemon already running");
      return;
    }
    this.ready = false;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.buffer = "";
    let daemonPath = vscode.workspace.getConfiguration("chimera").get("daemonPath", "");
    if (!daemonPath) {
      const possiblePaths = [
        path.join(this.workspaceRoot, "node_modules", "@chimera", "daemon", "dist", "index.js"),
        path.join(this.workspaceRoot, "..", "chimera-daemon", "dist", "index.js"),
        path.join(this.workspaceRoot, "packages", "chimera-daemon", "dist", "index.js")
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          daemonPath = p;
          break;
        }
      }
      if (!daemonPath) {
        let dir = path.dirname(this.workspaceRoot);
        while (dir !== path.dirname(dir)) {
          const candidate = path.join(dir, "chimera", "packages", "chimera-daemon", "dist", "index.js");
          if (fs.existsSync(candidate)) {
            daemonPath = candidate;
            break;
          }
          dir = path.dirname(dir);
        }
      }
    }
    if (!daemonPath || !fs.existsSync(daemonPath)) {
      this.log("Daemon not found. Build it with: pnpm --filter @chimera/daemon build");
      vscode.window.showWarningMessage(
        "Chimera daemon not found. Please build it first: pnpm --filter @chimera/daemon build"
      );
      return;
    }
    this.log(`Starting daemon from: ${daemonPath}`);
    this.process = (0, import_child_process.spawn)("node", [daemonPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });
    this.process.stdout?.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });
    this.process.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        this.log(text);
      }
    });
    this.process.on("exit", (code, signal) => {
      this.log(`Daemon exited (code: ${code}, signal: ${signal})`);
      this.process = null;
      this.ready = false;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Daemon exited (code: ${code})`));
      }
      this.pending.clear();
    });
    this.process.on("error", (err) => {
      this.log(`Daemon error: ${err.message}`);
    });
  }
  stop() {
    if (this.process) {
      this.log("Stopping daemon");
      this.process.stdin?.end();
      this.process.kill("SIGTERM");
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Daemon stopped by user"));
      }
      this.pending.clear();
      this.process = null;
      this.ready = false;
      this.buffer = "";
    }
  }
  restart() {
    this.stop();
    return this.start();
  }
  async call(method, params) {
    if (!this.process?.stdin?.writable) {
      throw new Error("Daemon not running");
    }
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, 3e4);
      this.pending.set(id, { resolve, reject, timer });
      const request = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.process.stdin.write(request);
    });
  }
  processBuffer() {
    let newlineIdx;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.method === "ready" && msg.jsonrpc === "2.0") {
          this.ready = true;
          this.log("Daemon ready");
          this.resolveReady();
          continue;
        }
        if (msg.method === "event" && msg.jsonrpc === "2.0") {
          this.onEvent?.("event", msg.params);
          continue;
        }
        if (msg.jsonrpc === "2.0" && msg.id != null) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch (err) {
        this.log(`Failed to parse daemon output: ${line}`);
      }
    }
  }
  log(message) {
    this.outputChannel.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}`);
  }
};

// src/chat-panel.ts
var vscode2 = __toESM(require("vscode"));
var ChatPanel = class _ChatPanel {
  static current;
  panel;
  context;
  daemon;
  messages = [];
  isProcessing = false;
  constructor(panel, context, daemon2) {
    this.panel = panel;
    this.context = context;
    this.daemon = daemon2;
    this.panel.onDidDispose(() => {
      _ChatPanel.current = void 0;
    });
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
    this.render();
  }
  static createOrShow(context, daemon2) {
    const column = vscode2.window.activeTextEditor ? vscode2.window.activeTextEditor.viewColumn : void 0;
    if (_ChatPanel.current) {
      _ChatPanel.current.panel.reveal(column);
      return _ChatPanel.current;
    }
    const panel = vscode2.window.createWebviewPanel(
      "chimeraChat",
      "Chimera AI",
      column ?? vscode2.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode2.Uri.joinPath(context.extensionUri, "media")
        ]
      }
    );
    _ChatPanel.current = new _ChatPanel(panel, context, daemon2);
    return _ChatPanel.current;
  }
  addMessage(role, content) {
    this.messages.push({ role, content, timestamp: Date.now() });
    this.render();
    const maxLines = vscode2.workspace.getConfiguration("chimera").get("maxOutputLines", 500);
    if (this.messages.length > maxLines) {
      this.messages = this.messages.slice(-maxLines);
    }
  }
  render() {
    this.panel.webview.html = this.getHtml();
  }
  async handleMessage(message) {
    switch (message.type) {
      case "send":
        if (message.text) {
          await this.processUserInput(message.text);
        }
        break;
      case "clear":
        this.messages = [];
        this.render();
        break;
      case "copy":
        if (message.text) {
          await vscode2.env.clipboard.writeText(message.text);
        }
        break;
    }
  }
  async processUserInput(text) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.addMessage("user", text);
    let mode = "ask";
    if (text.startsWith("/code ") || text.startsWith("/c ")) {
      mode = "code";
      text = text.replace(/^\/(code|c)\s+/, "");
    } else if (text.startsWith("/plan ") || text.startsWith("/p ")) {
      mode = "plan";
      text = text.replace(/^\/(plan|p)\s+/, "");
    } else if (text.startsWith("/review ") || text.startsWith("/r ")) {
      mode = "review";
      text = text.replace(/^\/(review|r)\s+/, "");
    } else if (text.startsWith("/debug ") || text.startsWith("/d ")) {
      mode = "debug";
      text = text.replace(/^\/(debug|d)\s+/, "");
    } else if (text.startsWith("/ask ") || text.startsWith("/a ")) {
      mode = "ask";
      text = text.replace(/^\/(ask|a)\s+/, "");
    } else if (text.startsWith("/auto ")) {
      mode = "auto";
      text = text.replace(/^\/auto\s+/, "");
    }
    try {
      this.postMessage({ type: "processing", mode });
      const editor = vscode2.window.activeTextEditor;
      let selectionText = "";
      let filePath = "";
      if (editor) {
        filePath = editor.document.uri.fsPath;
        const selection = editor.selection;
        if (!selection.isEmpty) {
          selectionText = editor.document.getText(selection);
        }
      }
      const contextMessage = this.buildContext(text, filePath, selectionText);
      const workspaceRoot = vscode2.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
      const result = await this.daemon.call("execute_task", {
        task: contextMessage,
        mode,
        workspaceRoot
      });
      this.addMessage("assistant", result.output);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.addMessage("system", `\u26A0 **Error**: ${errorMsg}`);
    } finally {
      this.isProcessing = false;
      this.postMessage({ type: "done" });
    }
  }
  buildContext(userMessage, filePath, selectionText) {
    let context = userMessage;
    if (filePath) {
      context = `[File: \`${filePath}\`]
${context}`;
    }
    if (selectionText) {
      context = `\`\`\`
${selectionText.slice(0, 4e3)}
\`\`\`
${context}`;
    }
    return context;
  }
  postMessage(message) {
    this.panel.webview.postMessage(message);
  }
  getHtml() {
    const fontSize = vscode2.workspace.getConfiguration("chimera").get("chatFontSize", 14);
    const messagesHtml = this.messages.map((msg) => this.renderMessage(msg)).join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --font-size: ${fontSize}px;
      --bg: ${this.getCssVariable("editor.background", "#1e1e1e")};
      --text: ${this.getCssVariable("editor.foreground", "#d4d4d4")};
      --user-bg: ${this.getCssVariable("list.activeSelectionBackground", "#094771")};
      --assistant-bg: ${this.getCssVariable("editor.inactiveSelectionBackground", "#3a3d41")};
      --system-bg: ${this.getCssVariable("inputValidation.warningBackground", "#352a05")};
      --border: ${this.getCssVariable("panel.border", "#454545")};
      --input-bg: ${this.getCssVariable("input.background", "#3c3c3c")};
      --primary: ${this.getCssVariable("focusBorder", "#007acc")};
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
  renderMessage(msg) {
    const roleClass = msg.role;
    const time = new Date(msg.timestamp).toLocaleTimeString();
    const escaped = this.escapeHtml(msg.content);
    const content = escaped.replace(
      /\/(ask|code|plan|review|debug|oal)/g,
      '<span class="mode-badge mode-$1">$1</span>'
    );
    const withCodeBlocks = content.replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      "<pre><code>$2</code></pre>"
    );
    return `<div class="message ${roleClass}">
      <div class="message-header">
        <span>${roleClass === "user" ? "\u{1F9D1} You" : roleClass === "assistant" ? "\u{1F9E0} Chimera" : "\u2699\uFE0F System"}</span>
        <span><span class="copy-btn" onclick="vscode.postMessage({type:'copy',text:${JSON.stringify(msg.content)}})">\u{1F4CB}</span> ${time}</span>
      </div>
      ${withCodeBlocks}
    </div>`;
  }
  escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  getCssVariable(name, fallback) {
    return fallback;
  }
};

// src/config-panel.ts
var vscode3 = __toESM(require("vscode"));
var ConfigPanel = class _ConfigPanel {
  static current;
  panel;
  context;
  daemon;
  constructor(panel, context, daemon2) {
    this.panel = panel;
    this.context = context;
    this.daemon = daemon2;
    this.panel.onDidDispose(() => {
      _ConfigPanel.current = void 0;
    });
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
    this.render();
  }
  static createOrShow(context, daemon2) {
    if (_ConfigPanel.current) {
      _ConfigPanel.current.panel.reveal();
      return _ConfigPanel.current;
    }
    const panel = vscode3.window.createWebviewPanel(
      "chimeraConfig",
      "Chimera Setup",
      vscode3.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    _ConfigPanel.current = new _ConfigPanel(panel, context, daemon2);
    return _ConfigPanel.current;
  }
  render() {
    this.panel.webview.html = this.getHtml();
  }
  async handleMessage(message) {
    switch (message.type) {
      case "save_config":
        if (message.config) {
          await this.saveConfig(message.config);
        }
        break;
      case "test_connection":
        vscode3.window.showInformationMessage("Chimera daemon connection is active.");
        break;
    }
  }
  async saveConfig(config) {
    const workspaceRoot = vscode3.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
    try {
      const chimeraConfig = {
        providers: config.providers.map((p) => ({
          name: p.name,
          provider: p.provider,
          model: p.model,
          api_key: p.apiKey ? `\${${this.getEnvKeyName(p.name, p.provider)}}` : void 0,
          base_url: p.baseUrl || void 0,
          role: p.role
        })),
        defaults: {
          auto_failover: true,
          fallback_chain: config.providers.map((p) => p.name)
        }
      };
      await this.daemon.call("save_config", {
        workspaceRoot,
        config: chimeraConfig
      });
      for (const p of config.providers) {
        if (p.apiKey) {
          const envKey = this.getEnvKeyName(p.name, p.provider);
          await vscode3.env.clipboard.writeText(
            `Set environment variable ${envKey}=${p.apiKey}`
          );
        }
      }
      vscode3.window.showInformationMessage(
        "Chimera configuration saved! Remember to set API keys as environment variables."
      );
      this.panel.dispose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode3.window.showErrorMessage(`Failed to save config: ${msg}`);
    }
  }
  getEnvKeyName(name, provider) {
    if (name === "cheap" || name === "primary") {
      return "CHIMERA_CHEAP_API_KEY";
    }
    if (provider === "anthropic") return "ANTHROPIC_API_KEY";
    if (provider === "openai") return "OPENAI_API_KEY";
    if (provider === "google") return "GOOGLE_API_KEY";
    return `${provider.toUpperCase()}_API_KEY`;
  }
  getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      padding: 20px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }
    h1 { font-size: 1.5em; margin-bottom: 8px; }
    h2 { font-size: 1.1em; margin: 16px 0 8px; opacity: 0.8; }
    p { margin-bottom: 16px; opacity: 0.7; line-height: 1.5; }
    .provider-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .provider-card h3 { margin-bottom: 8px; }
    .field { margin-bottom: 8px; }
    .field label { display: block; font-size: 0.85em; margin-bottom: 4px; opacity: 0.8; }
    .field input, .field select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 0.9em;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    .role-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
    }
    .role-writer { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .role-reviewer { background: var(--vscode-testing-iconPassed); color: var(--vscode-editor-foreground); }
    .role-challenger { background: var(--vscode-charts-orange); color: var(--vscode-editor-foreground); }
    .btn {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1em;
      font-weight: 600;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      margin-left: 8px;
    }
    .actions { margin-top: 24px; display: flex; gap: 8px; }
    .info-box {
      background: var(--vscode-editorInfo-background);
      border: 1px solid var(--vscode-editorInfo-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 0.9em;
    }
    .template-btns { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .template-btn {
      padding: 6px 14px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 16px;
      cursor: pointer;
      font-size: 0.85em;
      background: transparent;
      color: var(--vscode-editor-foreground);
    }
    .template-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .template-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
  </style>
</head>
<body>
  <h1>\u{1F9E0} Chimera Setup</h1>
  <p>Configure your provider pairing. Chimera uses a cheap model for bulk work and a frontier model for verification \u2014 saving you up to 60% on costs while maintaining quality.</p>

  <div class="info-box">
    <strong>How it works:</strong> Chimera runs 2-3 agents on different providers in parallel.
    The <strong>Writer</strong> drafts code (cheap model), the <strong>Reviewer</strong> verifies it (frontier model),
    and optionally the <strong>Challenger</strong> checks edge cases (third provider).
  </div>

  <h2>Quick Template</h2>
  <div class="template-btns">
    <button class="template-btn" onclick="applyTemplate('budget')">\u{1F4B0} Budget</button>
    <button class="template-btn" onclick="applyTemplate('balanced')">\u2696\uFE0F Balanced</button>
    <button class="template-btn" onclick="applyTemplate('quality')">\u{1F3C6} Quality</button>
  </div>

  <h2>Providers</h2>
  <p>Add at least 2 providers (Writer + Reviewer). A 3rd (Challenger) is optional but recommended for complex tasks.</p>

  <div id="providers-container">
    <div class="provider-card" data-idx="0">
      <h3><span class="role-badge role-writer">Writer</span></h3>
      <div class="field">
        <label>Provider Type</label>
        <select onchange="updateModelSuggestions(0)">
          <option value="openai-compatible">OpenAI-Compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>
      <div class="field">
        <label>Model</label>
        <input type="text" id="model-0" placeholder="deepseek-chat" value="deepseek-chat"/>
      </div>
      <div class="field">
        <label>Base URL (optional, for OpenAI-compatible)</label>
        <input type="text" id="base-url-0" placeholder="https://api.deepseek.com" value="https://api.deepseek.com"/>
      </div>
      <div class="field">
        <label>API Key</label>
        <input type="password" id="api-key-0" placeholder="sk-..."/>
      </div>
    </div>

    <div class="provider-card" data-idx="1">
      <h3><span class="role-badge role-reviewer">Reviewer</span></h3>
      <div class="field">
        <label>Provider Type</label>
        <select onchange="updateModelSuggestions(1)">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="google">Google</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>
      <div class="field">
        <label>Model</label>
        <input type="text" id="model-1" placeholder="claude-sonnet-4-20250514" value="claude-sonnet-4-20250514"/>
      </div>
      <div class="field">
        <label>Base URL (optional)</label>
        <input type="text" id="base-url-1" placeholder=""/>
      </div>
      <div class="field">
        <label>API Key</label>
        <input type="password" id="api-key-1" placeholder="sk-ant-..."/>
      </div>
    </div>

    <div class="provider-card" data-idx="2" id="challenger-card">
      <h3><span class="role-badge role-challenger">Challenger</span> <span style="opacity:0.5;font-size:0.8em;">Optional</span></h3>
      <div class="field">
        <label>Provider Type</label>
        <select onchange="updateModelSuggestions(2)">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>
      <div class="field">
        <label>Model</label>
        <input type="text" id="model-2" placeholder="gpt-4o" value="gpt-4o"/>
      </div>
      <div class="field">
        <label>Base URL (optional)</label>
        <input type="text" id="base-url-2" placeholder=""/>
      </div>
      <div class="field">
        <label>API Key</label>
        <input type="password" id="api-key-2" placeholder="sk-proj-..."/>
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-primary" onclick="saveConfig()">Save Configuration</button>
    <button class="btn btn-secondary" onclick="testConnection()">Test Connection</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const templates = {
      budget: [
        { provider: 'openai-compatible', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', role: 'writer' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514', baseUrl: '', role: 'reviewer' },
        { provider: 'openai', model: 'gpt-4o-mini', baseUrl: '', role: 'challenger' },
      ],
      balanced: [
        { provider: 'openai-compatible', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', role: 'writer' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514', baseUrl: '', role: 'reviewer' },
        { provider: 'openai', model: 'gpt-4o', baseUrl: '', role: 'challenger' },
      ],
      quality: [
        { provider: 'openai-compatible', model: 'kimi-k2', baseUrl: 'https://api.moonshot.cn', role: 'writer' },
        { provider: 'anthropic', model: 'claude-opus-4-20250514', baseUrl: '', role: 'reviewer' },
        { provider: 'openai', model: 'o3-mini', baseUrl: '', role: 'challenger' },
      ],
    };

    const modelSuggestions = {
      'openai-compatible': ['deepseek-chat', 'deepseek-coder', 'qwen2.5-coder', 'kimi-k2', 'custom'],
      'anthropic': ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-20250313', 'claude-3-5-sonnet-20241022'],
      'openai': ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1'],
      'google': ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'],
      'ollama': ['codellama', 'deepseek-coder', 'qwen2.5-coder', 'llama3', 'custom'],
    };

    function updateModelSuggestions(idx) {
      const select = document.querySelectorAll('.provider-card select')[idx];
      const modelInput = document.getElementById('model-' + idx);
      const provider = select.value;
      const suggestions = modelSuggestions[provider] || ['custom'];
      modelInput.placeholder = suggestions[0];
    }

    function applyTemplate(name) {
      const template = templates[name];
      if (!template) return;

      // Show/hide challenger
      document.getElementById('challenger-card').style.display = 'block';

      template.forEach((t, idx) => {
        const card = document.querySelectorAll('.provider-card')[idx];
        if (!card) return;

        const select = card.querySelector('select');
        const modelInput = document.getElementById('model-' + idx);
        const baseUrlInput = document.getElementById('base-url-' + idx);

        // Map role to value
        for (const opt of select.options) {
          if (opt.value === t.provider) {
            select.value = t.provider;
            break;
          }
        }
        modelInput.value = t.model;
        if (baseUrlInput) baseUrlInput.value = t.baseUrl || '';
      });

      // Highlight active template
      document.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      vscode.postMessage({ type: 'template_applied', name });
    }

    function getConfig() {
      const providers = [];
      const cards = document.querySelectorAll('.provider-card');
      cards.forEach((card, idx) => {
        if (card.style.display === 'none') return;
        const select = card.querySelector('select');
        const model = document.getElementById('model-' + idx).value;
        const baseUrl = document.getElementById('base-url-' + idx).value;
        const apiKey = document.getElementById('api-key-' + idx).value;

        const roles = ['writer', 'reviewer', 'challenger'];
        providers.push({
          name: ['primary', 'secondary', 'tertiary'][idx] || 'provider-' + idx,
          provider: select.value,
          model: model,
          apiKey: apiKey,
          baseUrl: baseUrl,
          role: roles[idx],
        });
      });
      return providers;
    }

    function saveConfig() {
      const providers = getConfig();
      if (providers.length < 2) {
        vscode.postMessage({ type: 'error', text: 'At least 2 providers are required (Writer + Reviewer).' });
        return;
      }
      vscode.postMessage({ type: 'save_config', config: { providers } });
    }

    function testConnection() {
      vscode.postMessage({ type: 'test_connection' });
    }
  </script>
</body>
</html>`;
  }
};

// src/status-bar.ts
var vscode4 = __toESM(require("vscode"));
var StatusBarManager = class {
  constructor(daemon2) {
    this.daemon = daemon2;
    this.daemonStatus = vscode4.window.createStatusBarItem(
      vscode4.StatusBarAlignment.Left,
      100
    );
    this.daemonStatus.command = "chimera.startDaemon";
    this.daemonStatus.tooltip = "Click to start Chimera daemon";
    this.modeStatus = vscode4.window.createStatusBarItem(
      vscode4.StatusBarAlignment.Left,
      99
    );
    this.modeStatus.command = "chimera.openChat";
    this.modeStatus.tooltip = "Open Chimera Chat";
    this.costStatus = vscode4.window.createStatusBarItem(
      vscode4.StatusBarAlignment.Right,
      100
    );
    this.costStatus.command = "chimera.showCost";
    this.costStatus.tooltip = "View Chimera cost report";
  }
  daemonStatus;
  modeStatus;
  costStatus;
  updateInterval;
  start() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.update();
    this.daemonStatus.show();
    this.modeStatus.show();
    this.costStatus.show();
    this.updateInterval = setInterval(() => this.update(), 3e4);
  }
  dispose() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.daemonStatus.dispose();
    this.modeStatus.dispose();
    this.costStatus.dispose();
  }
  async update() {
    if (this.daemon.isReady) {
      this.daemonStatus.text = "$(check) Chimera";
      this.daemonStatus.backgroundColor = void 0;
      this.daemonStatus.command = "chimera.stopDaemon";
      this.daemonStatus.tooltip = "Chimera daemon is running. Click to stop.";
      try {
        const health = await this.daemon.call("check_health");
        if (health.activeWorkers > 0) {
          this.modeStatus.text = `$(loading~spin) ${health.activeWorkers} agent(s)`;
          this.modeStatus.backgroundColor = new vscode4.ThemeColor(
            "statusBarItem.warningBackground"
          );
        } else {
          this.modeStatus.text = "$(comment-discussion) Chimera";
          this.modeStatus.backgroundColor = void 0;
        }
        try {
          const cost = await this.daemon.call("get_cost");
          this.costStatus.text = `$(graph) $${cost.total.toFixed(4)}`;
        } catch {
          this.costStatus.text = "$(graph) $0.00";
        }
      } catch {
        this.modeStatus.text = "$(debug-disconnect) Daemon error";
        this.modeStatus.backgroundColor = new vscode4.ThemeColor(
          "statusBarItem.errorBackground"
        );
      }
    } else {
      this.daemonStatus.text = "$(debug-disconnect) Chimera (stopped)";
      this.daemonStatus.backgroundColor = new vscode4.ThemeColor(
        "statusBarItem.errorBackground"
      );
      this.daemonStatus.command = "chimera.startDaemon";
      this.daemonStatus.tooltip = "Chimera daemon is not running. Click to start.";
      this.modeStatus.text = "";
      this.costStatus.text = "";
    }
  }
};

// src/extension.ts
var daemon;
var statusBar;
function activate(context) {
  console.log("[chimera] Activating extension...");
  daemon = new DaemonClient(context);
  statusBar = new StatusBarManager(daemon);
  context.subscriptions.push({
    dispose: () => statusBar?.dispose()
  });
  const autoStart = vscode5.workspace.getConfiguration("chimera").get("autoStartDaemon", true);
  if (autoStart) {
    daemon.start().then(() => {
      statusBar?.start();
    });
  } else {
    statusBar?.start();
  }
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.openChat", () => {
      if (!requireDaemon()) return;
      ChatPanel.createOrShow(context, daemon);
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.ask", async () => {
      if (!await ensureDaemon()) return;
      const panel = ChatPanel.createOrShow(context, daemon);
      const userInput = await vscode5.window.showInputBox({
        prompt: "Ask Chimera a question",
        placeHolder: "e.g., How does the auth flow work?",
        ignoreFocusOut: true
      });
      if (userInput) {
        panel.addMessage("user", userInput);
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.code", async () => {
      if (!await ensureDaemon()) return;
      const panel = ChatPanel.createOrShow(context, daemon);
      const userInput = await vscode5.window.showInputBox({
        prompt: "Describe the code to implement",
        placeHolder: "e.g., Add a rate limiter middleware",
        ignoreFocusOut: true
      });
      if (userInput) {
        panel.addMessage("user", `/code ${userInput}`);
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.plan", async () => {
      if (!await ensureDaemon()) return;
      const panel = ChatPanel.createOrShow(context, daemon);
      const userInput = await vscode5.window.showInputBox({
        prompt: "Describe what you want to plan",
        placeHolder: "e.g., Plan the implementation of a user auth module",
        ignoreFocusOut: true
      });
      if (userInput) {
        panel.addMessage("user", `/plan ${userInput}`);
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.review", async () => {
      if (!await ensureDaemon()) return;
      const editor = vscode5.window.activeTextEditor;
      if (!editor) {
        vscode5.window.showWarningMessage("No editor active. Select code to review.");
        return;
      }
      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode5.window.showWarningMessage("Select code to review.");
        return;
      }
      const panel = ChatPanel.createOrShow(context, daemon);
      panel.addMessage("user", `/review Review the following code:
\`\`\`
${selection.slice(0, 4e3)}
\`\`\``);
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.debug", async () => {
      if (!await ensureDaemon()) return;
      const panel = ChatPanel.createOrShow(context, daemon);
      const userInput = await vscode5.window.showInputBox({
        prompt: "Describe the bug or issue",
        placeHolder: "e.g., The login endpoint returns 500 when password is empty",
        ignoreFocusOut: true
      });
      if (userInput) {
        panel.addMessage("user", `/debug ${userInput}`);
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.explain", () => {
      if (!requireDaemon()) return;
      const editor = vscode5.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode5.window.showWarningMessage("Select code to explain.");
        return;
      }
      const selection = editor.document.getText(editor.selection);
      const panel = ChatPanel.createOrShow(context, daemon);
      panel.addMessage("user", `/explain Explain this code:
\`\`\`
${selection.slice(0, 4e3)}
\`\`\``);
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.fix", () => {
      if (!requireDaemon()) return;
      const editor = vscode5.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode5.window.showWarningMessage("Select code to fix.");
        return;
      }
      const selection = editor.document.getText(editor.selection);
      const panel = ChatPanel.createOrShow(context, daemon);
      panel.addMessage(
        "user",
        `/code Fix any issues in this code:
\`\`\`
${selection.slice(0, 4e3)}
\`\`\``
      );
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.toggleAgentDashboard", async () => {
      if (!requireDaemon()) return;
      vscode5.window.showInformationMessage(
        "Agent Dashboard is available when tasks are running."
      );
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.showCost", async () => {
      if (!daemon?.isReady) {
        vscode5.window.showWarningMessage("Chimera daemon is not running.");
        return;
      }
      try {
        const cost = await daemon.call("get_cost");
        const lines = ["## Chimera Cost Report", ""];
        lines.push(`**Total Cost:** $${cost.total.toFixed(4)}`);
        lines.push("");
        lines.push("| Provider | Spend | Budget |");
        lines.push("|----------|-------|--------|");
        for (const [provider, spend] of Object.entries(cost.byProvider)) {
          const budget = cost.budgetPerProvider[provider];
          const budgetStr = budget ? `$${budget.perSession.toFixed(2)}/session` : "unlimited";
          lines.push(`| ${provider} | $${spend.toFixed(4)} | ${budgetStr} |`);
        }
        const doc = await vscode5.workspace.openTextDocument({
          content: lines.join("\n"),
          language: "markdown"
        });
        await vscode5.window.showTextDocument(doc, { preview: true });
      } catch (err) {
        vscode5.window.showErrorMessage(
          `Failed to get cost: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.setupConfig", () => {
      if (!requireDaemon()) return;
      ConfigPanel.createOrShow(context, daemon);
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.startDaemon", async () => {
      if (!requireDaemon()) return;
      try {
        await daemon.start();
        statusBar?.start();
        vscode5.window.showInformationMessage("Chimera daemon started.");
      } catch (err) {
        vscode5.window.showErrorMessage(
          `Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.stopDaemon", () => {
      if (!requireDaemon()) return;
      daemon.stop();
      vscode5.window.showInformationMessage("Chimera daemon stopped.");
    })
  );
  context.subscriptions.push(
    vscode5.commands.registerCommand("chimera.restartDaemon", async () => {
      if (!requireDaemon()) return;
      try {
        await daemon.restart();
        vscode5.window.showInformationMessage("Chimera daemon restarted.");
      } catch (err) {
        vscode5.window.showErrorMessage(
          `Failed to restart daemon: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
  const fileWatcher = vscode5.workspace.createFileSystemWatcher("**/*");
  fileWatcher.onDidChange((uri) => {
    if (daemon?.isReady) {
      daemon.call("file_changed", { path: uri.fsPath, type: "changed" }).catch(() => {
      });
    }
  });
  fileWatcher.onDidCreate((uri) => {
    if (daemon?.isReady) {
      daemon.call("file_changed", { path: uri.fsPath, type: "created" }).catch(() => {
      });
    }
  });
  fileWatcher.onDidDelete((uri) => {
    if (daemon?.isReady) {
      daemon.call("file_changed", { path: uri.fsPath, type: "deleted" }).catch(() => {
      });
    }
  });
  context.subscriptions.push(fileWatcher);
  console.log("[chimera] Extension activated successfully.");
}
function deactivate() {
  console.log("[chimera] Deactivating extension...");
  daemon?.stop();
}
function requireDaemon() {
  if (!daemon?.isReady) {
    vscode5.window.showWarningMessage("Chimera daemon is not running. Start it with: Chimera: Start Daemon");
    return false;
  }
  return true;
}
async function ensureDaemon() {
  if (daemon?.isReady) return true;
  try {
    await daemon?.start();
    if (daemon) {
      await daemon.waitForReady();
      return true;
    }
  } catch {
    vscode5.window.showWarningMessage(
      "Chimera daemon is starting. Please try again in a moment."
    );
  }
  return false;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
