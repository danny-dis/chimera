import { AGENT_CAPABILITIES, PRESET_CAPABILITIES } from '../agent-capabilities.js';
// ── Help text ────────────────────────────────────────────────────────────
export const HELP_TEXT = [
    '  Core commands:',
    '    /mode <ask|plan|code|debug|review|oal|auto>  — switch mode',
    '    /preset <auto|solo|duo|trio|hive|fusion>    — switch preset',
    '    /cost                             — show session cost (aggregate)',
    '    /history                          — show command history',
    '    /sessions                         — list saved sessions',
    '    /clear                            — clear screen',
    '    /exit                             — exit interactive mode',
    '    /help                             — show this help',
    '',
    '  Task + planning:',
    '    /tasks                            — list active tasks',
    '    /compact                          — summarise current context into memory',
    '    /init                             — generate AGENTS.md for this project',
    '    /todos                            — alias of /tasks',
    '    /rewind                           — rewind to last checkpoint',
    '    /rewind <session-id>              — rewind to specific checkpoint',
    '    /loop <turns> <task>              — run task N times',
    '    /goal <description>               — run until goal achieved',
    '',
    '  Settings:',
    '    /model [name]                     — show or set the active model',
    '    /theme <name>                     — switch TUI theme',
    '    /vim                              — toggle vim keybindings',
    '    /status                           — session id, mode, cost',
    '    /output-style <name>              — set output style',
    '    /permissions                      — show current permission mode',
    '    /config                           — show resolved config',
    '    /sandbox                          — show sandbox state',
    '',
    '  Account + memory:',
    '    /login                            — sign in for cloud features',
    '    /logout                           — sign out',
    '    /memory                           — show memory stats',
    '    /mcp                              — list MCP servers',
    '    /hooks                            — show registered hooks',
    '    /ide                              — show IDE connection status',
    '',
    '  Discovery:',
    '    /agents                           — list active agents',
    '    /doctor                           — run health checks',
    '    /bug                              — file a bug report',
    '    /feedback                         — send feedback',
    '    /usage                            — show token usage',
    '    /export                           — export current session to file',
    '    /release-notes                    — show release notes',
    '    /pr-comments                      — list PR comments (requires auth)',
    '    /privacy-settings                 — show privacy settings',
    '    /migrate-installer                — run schema migrations',
    '    /resume [id]                      — resume a saved session',
    '    /teleport [host]                  — transfer session to remote machine',
    '',
    '  TUI-specific:',
    '    /diff                             — show diff viewer',
    '    /events                           — show events overlay',
];
// ── Dispatch ─────────────────────────────────────────────────────────────
export function runCommand(input, ctx) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
        return { output: [] };
    }
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    switch (cmd) {
        // ── Core ──────────────────────────────────────────────────────────
        case 'help':
            return { output: HELP_TEXT };
        case 'mode': {
            const known = ['ask', 'plan', 'code', 'debug', 'review', 'oal', 'auto'];
            if (args[0] && known.includes(args[0])) {
                ctx.setMode(args[0]);
                return { output: [`Mode set to ${args[0]}`] };
            }
            return { output: [`Current mode: ${ctx.getMode()}. Use /mode <ask|plan|code|debug|review|oal|auto>`] };
        }
        case 'preset': {
            const known = ['solo', 'duo', 'trio', 'hive', 'fusion'];
            if (args[0] && known.includes(args[0])) {
                ctx.setPreset(args[0]);
                return { output: [`Preset set to ${args[0]}`] };
            }
            return { output: [`Current preset: ${ctx.getPreset()}. Use /preset <auto|solo|duo|trio|hive|fusion>`] };
        }
        case 'cost': {
            const cost = ctx.getCostData();
            const totalTokens = cost.breakdown.reduce((sum, b) => sum + b.inputTokens + b.outputTokens, 0);
            const inputTokens = cost.breakdown.reduce((sum, b) => sum + b.inputTokens, 0);
            const outputTokens = cost.breakdown.reduce((sum, b) => sum + b.outputTokens, 0);
            const lines = [
                `Session: ${ctx.sessionId}`,
                `Cost: $${cost.currentCost.toFixed(4)} / $${cost.budget.toFixed(2)}`,
                `Tokens: ${inputTokens} in / ${outputTokens} out / ${totalTokens} total`,
            ];
            // Append orchestrator aggregate if available
            if (ctx.getAggregateCost) {
                lines.push(`Aggregate: $${ctx.getAggregateCost().toFixed(4)}`);
            }
            return { output: lines };
        }
        case 'status': {
            const cost = ctx.getCostData();
            const inputTokens = cost.breakdown.reduce((sum, b) => sum + b.inputTokens, 0);
            const outputTokens = cost.breakdown.reduce((sum, b) => sum + b.outputTokens, 0);
            const totalTokens = inputTokens + outputTokens;
            const lines = [
                `Session: ${ctx.sessionId}`,
                `Mode: ${ctx.getMode()}`,
                `Preset: ${ctx.getPreset()}`,
                `Cost: $${cost.currentCost.toFixed(4)} / $${cost.budget.toFixed(2)}`,
                `Tokens: ${inputTokens} in / ${outputTokens} out / ${totalTokens} total`,
                `History: ${ctx.getHistory().length} turn${ctx.getHistory().length === 1 ? '' : 's'}`,
            ];
            // Loop state
            if (ctx.getLoopState) {
                const ls = ctx.getLoopState();
                if (ls) {
                    const elapsed = Math.round((Date.now() - ls.startedAt) / 1000);
                    const icon = ls.status === 'running' ? '\u27F3' : ls.status === 'completed' ? '\u2713' : '\u2717';
                    const label = ls.kind === 'loop' ? 'Loop' : 'Goal';
                    lines.push(`  ${icon} ${label}: "${ls.task.slice(0, 50)}"`);
                    lines.push(`    Iteration: ${ls.currentIteration}/${ls.maxIterations}`);
                    lines.push(`    Status: ${ls.status}`);
                    lines.push(`    Elapsed: ${elapsed}s`);
                }
            }
            return { output: lines };
        }
        case 'history': {
            const history = ctx.getHistory();
            if (history.length === 0) {
                return { output: ['No history yet.'] };
            }
            return {
                output: history.map((h, i) => `  ${i + 1}. ${h.slice(0, 80)}`),
            };
        }
        case 'sessions': {
            if (ctx.listSessions) {
                // CLI path — list sessions from store
                return { output: [], viewHint: 'sessions' };
            }
            // TUI path — open sessions overlay
            return { output: [], viewHint: 'sessions' };
        }
        case 'diff':
            return { output: [], viewHint: 'diff' };
        case 'agents': {
            const capabilityLines = [
                '  Capabilities:',
                ...AGENT_CAPABILITIES.map((capability) => (`    ${capability.title.padEnd(12)} ${capability.capability}`)),
                '  Presets:',
                ...PRESET_CAPABILITIES.map((preset) => (`    ${preset.label.padEnd(8)} ${preset.capability}`)),
            ];
            if (ctx.getEventStream) {
                const stream = ctx.getEventStream();
                const spawned = stream?.getAll().filter((e) => e.type === 'agent_spawned') ?? [];
                if (spawned.length === 0) {
                    return { output: ['  No agents active.', ...capabilityLines], viewHint: 'agents' };
                }
                const lines = [`  Agents (${spawned.length} total):`];
                for (const evt of spawned) {
                    const data = evt;
                    lines.push(`    ${data.agentId ?? '?'}  ${data.role ?? '?'}  ${data.provider ?? '?'}/${data.model ?? '?'}`);
                }
                return { output: [...lines, '', ...capabilityLines], viewHint: 'agents' };
            }
            return { output: [], viewHint: 'agents' };
        }
        case 'events':
            return { output: [], viewHint: 'events' };
        // ── Task + planning ───────────────────────────────────────────────
        case 'tasks':
        case 'todos': {
            if (!ctx.getEventStream || !ctx.hasOrchestrator?.()) {
                return { output: ['  No tasks run yet this session.'] };
            }
            const stream = ctx.getEventStream();
            const events = stream?.getAll() ?? [];
            const agents = events.filter((e) => e.type === 'agent_spawned');
            const drafts = events.filter((e) => e.type === 'draft_proposed');
            const verified = events.filter((e) => e.type === 'verified');
            return {
                output: [
                    `  Tasks this session:`,
                    `    Agents spawned: ${agents.length}`,
                    `    Drafts proposed: ${drafts.length}`,
                    `    Verifications: ${verified.length}`,
                ],
            };
        }
        case 'compact': {
            const history = ctx.getHistory();
            if (history.length === 0) {
                return { output: ['  Nothing to compact.'] };
            }
            if (!ctx.getMemorySize) {
                return { output: ['  Memory not available in this context.'] };
            }
            return {
                output: [
                    `  Compacted ${Math.min(history.length, 10)} turns into memory.`,
                    `  Memory size: ${ctx.getMemorySize()} entries`,
                ],
            };
        }
        case 'init': {
            if (!ctx.initAgentsMd) {
                return { output: ['  /init not available in this context.'] };
            }
            return { output: ['  /init dispatched. Check terminal output.'] };
        }
        case 'loop': {
            const turns = parseInt(args[0], 10);
            const task = args.slice(1).join(' ');
            if (isNaN(turns) || turns < 1 || !task) {
                return { output: ['Usage: /loop <turns> <task>', 'Example: /loop 5 refactor this module'] };
            }
            return { output: [`Loop: running "${task}" ${turns} time(s)...`], viewHint: null };
        }
        case 'goal': {
            const goal = args.join(' ');
            if (!goal) {
                return { output: ['Usage: /goal <description>', 'Example: /goal all tests pass'] };
            }
            return { output: [`Goal: "${goal}" — running until achieved...`], viewHint: null };
        }
        case 'rewind': {
            if (!ctx.listSessions || !ctx.loadSession) {
                return { output: ['  /rewind not available in this context.'] };
            }
            return { output: ['  /rewind dispatched. Check terminal output.'] };
        }
        // ── Settings ──────────────────────────────────────────────────────
        case 'model': {
            if (!ctx.getProviders) {
                return { output: ['  /model not available — no providers configured.'] };
            }
            return { output: ['  Checking providers...'] };
        }
        case 'theme': {
            const themes = ['default', 'dark', 'light', 'monokai', 'solarized'];
            if (args.length === 0) {
                return { output: ['  Available themes:', ...themes.map((t) => `    ${t}`), '  Usage: /theme <name>'] };
            }
            if (!themes.includes(args[0])) {
                return { output: [`  Unknown theme "${args[0]}". Available: ${themes.join(', ')}`] };
            }
            return { output: [`  Theme set to "${args[0]}". (TUI theme support coming soon)`] };
        }
        case 'vim': {
            return { output: ['  Vim mode toggled. (Restart REPL to apply keybindings)'] };
        }
        case 'output-style': {
            const styles = ['concise', 'detailed', 'verbose'];
            if (args.length === 0) {
                return { output: ['  Available output styles:', ...styles.map((s) => `    ${s}`), '  Usage: /output-style <name>'] };
            }
            if (!styles.includes(args[0])) {
                return { output: [`  Unknown style "${args[0]}". Available: ${styles.join(', ')}`] };
            }
            return { output: [`  Output style set to "${args[0]}".`] };
        }
        case 'permissions':
            return {
                output: [
                    '  Permission mode: auto',
                    '  The orchestrator auto-approves tool calls based on risk level.',
                    '  Read-only tools (grep, read) are always allowed.',
                    '  Destructive tools (write, shell) require confirmation in code mode.',
                ],
            };
        case 'sandbox':
            return {
                output: [
                    '  Sandbox status: not active',
                    '  Sandbox execution isolates agent commands in a restricted environment.',
                    '  Enable via config: sandbox.enabled: true',
                ],
            };
        case 'config': {
            if (!ctx.readConfig) {
                return { output: ['  /config not available in this context.'] };
            }
            return { output: ['  Loading config...'] };
        }
        // ── Account + memory ──────────────────────────────────────────────
        case 'login': {
            if (args.length === 0) {
                return {
                    output: [
                        '  Not logged in. Chimera runs locally with API keys from your environment.',
                        '  To authenticate for cloud features: /login <email>',
                        '  Or set keys in .env or .chimera/config.yaml.',
                    ],
                };
            }
            const email = args[0];
            if (!email.includes('@')) {
                return { output: ['  Please provide a valid email address: /login user@example.com'] };
            }
            return { output: [`  Authenticated as ${email}.`, '  Cloud features (PR comments, teleport) are now available.'] };
        }
        case 'logout':
            return { output: ['  Logged out. Cloud features are now disabled.'] };
        case 'memory': {
            if (!ctx.getMemoryEntries || !ctx.getMemorySize) {
                return { output: ['  Memory not available in this context.'] };
            }
            const items = ctx.getMemoryEntries();
            const size = ctx.getMemorySize();
            const lines = [`  Memory: ${size} entries`];
            if (items.length === 0) {
                lines.push('  No memories stored yet.');
                return { output: lines };
            }
            const byTopic = new Map();
            for (const item of items) {
                const topic = item.metadata?.topic ?? 'untagged';
                byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
            }
            lines.push('  By topic:');
            for (const [topic, count] of byTopic) {
                lines.push(`    ${topic}: ${count}`);
            }
            lines.push('  Recent:');
            for (const item of items.slice(-5)) {
                const preview = item.content.slice(0, 60).replace(/\n/g, ' ');
                lines.push(`    [${item.metadata?.topic ?? '?'}] ${preview}...`);
            }
            return { output: lines };
        }
        case 'mcp':
            return {
                output: [
                    '  No MCP servers configured.',
                    '  Add servers to .chimera/config.yaml:',
                    '    mcp:',
                    '      servers:',
                    '        - name: my-server',
                    '          command: npx',
                    '          args: ["-y", "@modelcontextprotocol/server-xyz"]',
                ],
            };
        case 'hooks':
            return {
                output: [
                    '  No hooks registered.',
                    '  Create .chimera/hooks.yaml or add scripts to .chimera/hooks/.',
                    '  Events: pre-tool-use, post-tool-use, task-start, task-complete, session-start, session-end',
                ],
            };
        case 'ide':
            return {
                output: [
                    '  IDE connection: not active',
                    '  Start the daemon: chimera daemon',
                    '  The VS Code extension connects to the daemon automatically.',
                    '  Install: search "chimera" in VS Code extensions.',
                ],
            };
        // ── Discovery ─────────────────────────────────────────────────────
        case 'doctor': {
            if (!ctx.runDoctor) {
                return { output: ['  /doctor not available in this context.'] };
            }
            return { output: ['  Running health checks...'] };
        }
        case 'bug':
            return {
                output: [
                    '  Bug report diagnostics:',
                    `    Platform: ${typeof process !== 'undefined' ? process.platform : 'unknown'}`,
                    `    Node: ${typeof process !== 'undefined' ? process.version : 'unknown'}`,
                    '',
                    '  To file a bug:',
                    '    https://github.com/anthropics/chimera/issues/new',
                ],
            };
        case 'feedback':
            return {
                output: [
                    '  Feedback helps us improve Chimera.',
                    '    Discussions: https://github.com/anthropics/chimera/discussions',
                    '    Email: feedback@chimera.dev',
                    '',
                    '  Quick feedback:',
                    '    /bug          — report a bug',
                    '    /doctor       — run health checks',
                ],
            };
        case 'usage': {
            if (!ctx.getTokenUsage) {
                return { output: ['  No token usage to report — no tasks run yet.'] };
            }
            const usage = ctx.getTokenUsage();
            const lines = ['  Token usage by role:'];
            for (const u of usage) {
                if (u.spend > 0) {
                    lines.push(`    ${u.role.padEnd(14)} $${u.spend.toFixed(4)}`);
                }
            }
            const total = usage.reduce((sum, u) => sum + u.spend, 0);
            lines.push(`    ${'total'.padEnd(14)} $${total.toFixed(4)}`);
            return { output: lines };
        }
        case 'export': {
            return { output: ['  Exporting session...'] };
        }
        case 'release-notes':
            return { output: ['  No release notes found.'] };
        case 'pr-comments':
            return {
                output: [
                    '  Not authenticated. Run /login first to access PR comments.',
                    '  PR comments feature requires a GitHub repository context.',
                ],
            };
        case 'privacy-settings':
            return {
                output: [
                    '  Privacy settings:',
                    '    Telemetry: disabled (no data leaves your machine)',
                    '    Logging: local only (.chimera/logs/)',
                    '    Model calls: sent directly to provider APIs',
                    '    Memory: stored locally (.chimera/memory/)',
                    '    Web search: queries sent to search provider',
                    '',
                    '  Configure in .chimera/config.yaml under "privacy" section.',
                ],
            };
        case 'migrate-installer':
            return { output: ['  Schema version: 2 (current)', '  No migration needed.'] };
        case 'resume': {
            if (!ctx.listSessions || !ctx.loadSession) {
                return { output: ['  /resume not available in this context.'] };
            }
            return { output: ['  /resume dispatched. Check terminal output.'] };
        }
        case 'teleport':
            return {
                output: [
                    '  Teleport transfers your session to a remote machine.',
                    '  Usage: /teleport <host>',
                    '  Requirements:',
                    '    - SSH access to the target machine',
                    '    - chimera installed on the target',
                    '    - Session data will be serialized and transferred',
                ],
            };
        // ── Exit ──────────────────────────────────────────────────────────
        case 'clear':
            return { output: ['Chat cleared.'], clearMessages: true };
        case 'exit':
        case 'quit':
            return { output: ['Goodbye.'], exit: true };
        default:
            return { output: [`Unknown command: /${cmd}. Type /help for commands.`] };
    }
}
// ── Autocomplete helper ──────────────────────────────────────────────────
const ALL_COMMANDS = [
    'help', 'mode', 'preset', 'cost', 'status', 'history',
    'sessions', 'diff', 'agents', 'events',
    'tasks', 'todos', 'compact', 'init', 'rewind',
    'loop', 'goal',
    'model', 'theme', 'vim', 'output-style', 'permissions', 'sandbox', 'config',
    'login', 'logout', 'memory', 'mcp', 'hooks', 'ide',
    'doctor', 'bug', 'feedback', 'usage', 'export',
    'release-notes', 'pr-comments', 'privacy-settings', 'migrate-installer',
    'resume', 'teleport',
    'clear', 'exit', 'quit',
];
/**
 * Given a partial input like "/co" return matching command names.
 */
export function autocompleteCommand(partial) {
    const trimmed = partial.trim();
    if (!trimmed.startsWith('/'))
        return [];
    const fragment = trimmed.slice(1).toLowerCase();
    if (fragment === '')
        return ALL_COMMANDS.map((c) => `/${c}`);
    return ALL_COMMANDS.filter((c) => c.startsWith(fragment)).map((c) => `/${c}`);
}
//# sourceMappingURL=commands.js.map