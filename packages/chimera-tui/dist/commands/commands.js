// ── Help text ────────────────────────────────────────────────────────────
const HELP_TEXT = [
    'Core commands:',
    '  /mode <ask|plan|code|debug|review|oal|auto>  — switch mode (task intent)',
    '  /preset <auto|solo|duo|trio|hive|fusion>    — switch preset (agent topology)',
    '  /loop <turns> <task>              — run task N times',
    '  /goal <description>               — run until goal achieved',
    '  /cost                             — show session cost',
    '  /status                           — session id, mode, preset, cost',
    '  /history                          — show command history',
    '  /sessions                         — list saved sessions',
    '  /diff                             — show diff viewer',
    '  /clear                            — clear chat',
    '  /exit                             — exit chimera',
    '  /help                             — show this help',
    '',
    'Shortcuts:',
    '  Tab  cycle focus (input / mode / preset)',
    '  ^A  agents overlay    ^T  cost overlay    ^E  events overlay',
    '  ^D  diff viewer       ^S  sessions        ^Q  quit',
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
            return { output: lines };
        }
        case 'status': {
            const cost = ctx.getCostData();
            const inputTokens = cost.breakdown.reduce((sum, b) => sum + b.inputTokens, 0);
            const outputTokens = cost.breakdown.reduce((sum, b) => sum + b.outputTokens, 0);
            const totalTokens = inputTokens + outputTokens;
            return {
                output: [
                    `Session: ${ctx.sessionId}`,
                    `Mode: ${ctx.getMode()}`,
                    `Preset: ${ctx.getPreset()}`,
                    `Cost: $${cost.currentCost.toFixed(4)} / $${cost.budget.toFixed(2)}`,
                    `Tokens: ${inputTokens} in / ${outputTokens} out / ${totalTokens} total`,
                    `History: ${ctx.getHistory().length} turn${ctx.getHistory().length === 1 ? '' : 's'}`,
                ],
            };
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
        case 'sessions':
            return { output: [], viewHint: 'sessions' };
        case 'diff':
            return { output: [], viewHint: 'diff' };
        case 'agents':
            return { output: [], viewHint: 'agents' };
        case 'events':
            return { output: [], viewHint: 'events' };
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
    'loop', 'goal',
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