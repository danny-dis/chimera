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
    ask: { icon: '?', label: 'Ask', description: 'Quick Q&A', desc: {
            beginner: 'Ask a question and get a direct answer — no code is changed.',
            intermediate: 'Quick Q&A',
            advanced: 'Q&A only; read-only, no mutations.',
        } },
    plan: { icon: '◈', label: 'Plan', description: 'Plan changes', desc: {
            beginner: 'Chat about a change and see a step-by-step plan before anything is edited.',
            intermediate: 'Plan changes',
            advanced: 'Propose an implementation plan; no writes applied.',
        } },
    code: { icon: '⚡', label: 'Code', description: 'Write code', desc: {
            beginner: 'Tell it what to build and it edits your files to make it happen.',
            intermediate: 'Write code',
            advanced: 'Autonomous writes against the working tree.',
        } },
    debug: { icon: '◉', label: 'Debug', description: 'Debug issues', desc: {
            beginner: 'Describe a bug and it investigates, then fixes the root cause.',
            intermediate: 'Debug issues',
            advanced: 'Repro → root-cause → patch cycle.',
        } },
    review: { icon: '◎', label: 'Review', description: 'Review code', desc: {
            beginner: 'Get a diff reviewed for bugs, style, and risks before you merge.',
            intermediate: 'Review code',
            advanced: 'Static review of a changeset; returns findings.',
        } },
    oal: { icon: '◆', label: 'OAL', description: 'OAL mode', desc: {
            beginner: 'Let Chimera work through a long task on its own, looping until the job is done.',
            intermediate: 'OAL — autonomous loop; runs the task to completion within a budget.',
            advanced: 'Autonomous loop; bounded by budget, self-iterates to completion.',
        } },
    auto: { icon: '⟳', label: 'Auto', description: 'Auto-select mode', desc: {
            beginner: 'Pick the best mode (ask/plan/code/debug/review) for your request automatically.',
            intermediate: 'Auto-select mode',
            advanced: 'Mode inferred per task from the request.',
        } },
};
export const PRESETS = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm', 'merge'];
export const PRESET_META = {
    solo: { icon: '●', label: 'Solo', description: 'Single agent', desc: {
            beginner: 'One assistant does the whole task — simplest option.',
            intermediate: 'Single agent',
            advanced: 'Single-agent execution.',
        } },
    duo: { icon: '◉', label: 'Duo', description: 'Two agents', desc: {
            beginner: 'One writes the code and one double-checks it for mistakes.',
            intermediate: 'Two agents',
            advanced: 'Writer + reviewer pair.',
        } },
    trio: { icon: '◎', label: 'Trio', description: 'Three agents', desc: {
            beginner: 'Writer, reviewer, and a challenger that pokes holes in the plan.',
            intermediate: 'Three agents',
            advanced: 'Writer + reviewer + challenger.',
        } },
    merge: { icon: '⬡', label: 'Merge', description: 'Merge multiple agent outputs', desc: {
            beginner: 'Several agents each take a stab, then their answers are combined.',
            intermediate: 'Merge multiple agent outputs',
            advanced: 'Fan-out then merge outputs.',
        } },
    hive: { icon: '⬡', label: 'Hive', description: 'Decompose & parallel subtasks', desc: {
            beginner: 'Breaks a big job into smaller pieces run at the same time to go faster.',
            intermediate: 'Decompose & parallel subtasks',
            advanced: 'Decomposes task; parallel sub-execution.',
        } },
    fusion: { icon: '◆', label: 'Fusion', description: 'Multi-model fusion', desc: {
            beginner: 'Combines answers from different AI models so you get the best of each.',
            intermediate: 'Multi-model fusion',
            advanced: 'Cross-model answer fusion.',
        } },
    swarm: { icon: '🐝', label: 'Swarm', description: 'Autonomous swarm orchestration', desc: {
            beginner: 'Many assistants coordinate to tackle a large task without your step-by-step input.',
            intermediate: 'Autonomous swarm orchestration',
            advanced: 'Autonomous multi-agent orchestration.',
        } },
    auto: { icon: '⚡', label: 'Auto', description: 'Automatic selection', desc: {
            beginner: 'Chooses the right team size for your task automatically.',
            intermediate: 'Automatic selection',
            advanced: 'Preset inferred per task.',
        } },
};
/**
 * Resolve a tiered string for the current skill tier. Guards against a
 * missing model (renders `intermediate` so the TUI still works uninstrumented).
 */
export function tiered(msg, model) {
    return msg[model?.tier() ?? 'intermediate'];
}
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