/**
 * Zen theme — the single design system for the Chimera TUI.
 * Every component reads colors from here; no raw color strings allowed.
 */
export const zen = {
    bg: 'black',
    fg: 'white',
    muted: 'gray',
    accent: 'cyan',
    accentDim: 'gray',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    info: 'blue',
    agent: 'magenta',
    panel: 'gray',
    border: 'gray',
    borderActive: 'cyan',
    highlight: 'cyan',
    // Role hues — keep in sync with `roleColors` below.
    role: {
        writer: 'green',
        reviewer: 'blue',
        challenger: 'yellow',
        synthesizer: 'magenta',
        planner: 'cyan',
        researcher: 'white',
        summarizer: 'gray',
    },
    // Syntax highlighting palette — consumed by syntax.ts / markdown.tsx.
    syntax: {
        keyword: 'magenta',
        string: 'green',
        comment: 'gray',
        number: 'yellow',
        function: 'cyan',
        type: 'blue',
        plain: 'white',
    },
};
// ── Layout constants ──────────────────────────────────────────────────
export const MIN_COLUMNS = 80;
export const MIN_ROWS = 24;
export const SIDEBAR_MIN_WIDTH = 28;
export const SIDEBAR_MAX_WIDTH = 45;
export const SIDEBAR_CONTENT_OVERHEAD = 9;
export const MODES = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];
export const MODE_META = {
    ask: { icon: '?', label: 'Ask', description: 'Quick Q&A' },
    plan: { icon: '◈', label: 'Plan', description: 'Plan changes' },
    code: { icon: '⚡', label: 'Code', description: 'Write code' },
    debug: { icon: '◉', label: 'Debug', description: 'Debug issues' },
    review: { icon: '◎', label: 'Review', description: 'Review code' },
    oal: { icon: '◆', label: 'OAL', description: 'OAL mode' },
    auto: { icon: '⟳', label: 'Auto', description: 'Auto-select mode' },
};
export const PRESETS = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];
export const PRESET_META = {
    solo: { icon: '●', label: 'Solo', description: 'Single agent' },
    duo: { icon: '◉', label: 'Duo', description: 'Two agents' },
    trio: { icon: '◎', label: 'Trio', description: 'Three agents' },
    merge: { icon: '⬡', label: 'Merge', description: 'Merge multiple agent outputs' },
    hive: { icon: '⬡', label: 'Hive', description: 'Decompose & parallel subtasks' },
    fusion: { icon: '◆', label: 'Fusion', description: 'Multi-model fusion' },
    swarm: { icon: '🐝', label: 'Swarm', description: 'Autonomous swarm orchestration' },
    auto: { icon: '⚡', label: 'Auto', description: 'Automatic selection' },
};
// ── Color helpers ──────────────────────────────────────────────────────
/** Safe role color lookup (never throws, always returns a valid ink color). */
export function roleColors(role) {
    return zen.role[role] ?? zen.muted;
}
/** Identity passthrough — documents that a string is a theme color. */
export function c(color) {
    return color;
}
//# sourceMappingURL=theme.js.map