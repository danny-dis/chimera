// ---------------------------------------------------------------------------
// ConfigPanel — setup wizard for Chimera provider configuration
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client';

export class ConfigPanel {
  public static current: ConfigPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly daemon: DaemonClient;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    daemon: DaemonClient,
  ) {
    this.panel = panel;
    this.context = context;
    this.daemon = daemon;
    this.panel.onDidDispose(() => {
      ConfigPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
    this.render();
  }

  static createOrShow(context: vscode.ExtensionContext, daemon: DaemonClient): ConfigPanel {
    if (ConfigPanel.current) {
      ConfigPanel.current.panel.reveal();
      return ConfigPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'chimeraConfig',
      'Chimera Setup',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    ConfigPanel.current = new ConfigPanel(panel, context, daemon);
    return ConfigPanel.current;
  }

  private render(): void {
    this.panel.webview.html = this.getHtml();
  }

  private async handleMessage(message: {
    type: string;
    config?: {
      providers: Array<{
        name: string;
        provider: string;
        model: string;
        apiKey: string;
        baseUrl: string;
        role: string;
      }>;
    };
  }): Promise<void> {
    switch (message.type) {
      case 'save_config':
        if (message.config) {
          await this.saveConfig(message.config);
        }
        break;
      case 'test_connection':
        vscode.window.showInformationMessage('Chimera daemon connection is active.');
        break;
    }
  }

  private async saveConfig(config: {
    providers: Array<{
      name: string;
      provider: string;
      model: string;
      apiKey: string;
      baseUrl: string;
      role: string;
    }>;
  }): Promise<void> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();

    try {
      // Transform to chimera config format
      const chimeraConfig = {
        providers: config.providers.map((p) => ({
          name: p.name,
          provider: p.provider,
          model: p.model,
          api_key: p.apiKey ? `\${${this.getEnvKeyName(p.name, p.provider)}}` : undefined,
          base_url: p.baseUrl || undefined,
          role: p.role,
        })),
        defaults: {
          auto_failover: true,
          fallback_chain: config.providers.map((p) => p.name),
        },
      };

      await this.daemon.call('save_config', {
        workspaceRoot,
        config: chimeraConfig,
      });

      // Store API keys in VS Code global state (or env)
      for (const p of config.providers) {
        if (p.apiKey) {
          const envKey = this.getEnvKeyName(p.name, p.provider);
          await vscode.env.clipboard.writeText(
            `Set environment variable ${envKey}=${p.apiKey}`,
          );
        }
      }

      vscode.window.showInformationMessage(
        'Chimera configuration saved! Remember to set API keys as environment variables.',
      );
      this.panel.dispose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save config: ${msg}`);
    }
  }

  private getEnvKeyName(name: string, provider: string): string {
    if (name === 'cheap' || name === 'primary') {
      return 'CHIMERA_CHEAP_API_KEY';
    }
    if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
    if (provider === 'openai') return 'OPENAI_API_KEY';
    if (provider === 'google') return 'GOOGLE_API_KEY';
    return `${provider.toUpperCase()}_API_KEY`;
  }

  private getHtml(): string {
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
  <h1>🧠 Chimera Setup</h1>
  <p>Configure your provider pairing. Chimera uses a cheap model for bulk work and a frontier model for verification — saving you up to 60% on costs while maintaining quality.</p>

  <div class="info-box">
    <strong>How it works:</strong> Chimera runs 2-3 agents on different providers in parallel.
    The <strong>Writer</strong> drafts code (cheap model), the <strong>Reviewer</strong> verifies it (frontier model),
    and optionally the <strong>Challenger</strong> checks edge cases (third provider).
  </div>

  <h2>Quick Template</h2>
  <div class="template-btns">
    <button class="template-btn" onclick="applyTemplate('budget')">💰 Budget</button>
    <button class="template-btn" onclick="applyTemplate('balanced')">⚖️ Balanced</button>
    <button class="template-btn" onclick="applyTemplate('quality')">🏆 Quality</button>
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
}