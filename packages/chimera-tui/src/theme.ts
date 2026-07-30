import type { Mode, DeliberationMode, AgentRole } from '@chimera/core';
import type { SkillTier } from './types.js';

/**
 * Zen theme — the single design system for the Chimera TUI.
 * Every component reads colors from here; no raw color strings allowed.
 *
 * ── Color strategy ──────────────────────────────────────────────────────
 * Two families of tokens live in this palette, deliberately treated
 * differently:
 *
 *  1. Body text / structure (`bg`, `fg`, `muted`, `panel`, `border`) stay as
 *     plain ANSI-16 names ('white', 'gray', ...). These map onto whatever
 *     16-color palette the user's terminal is configured with, so they
 *     automatically stay readable on both light- and dark-background
 *     terminals. Hard-coding these as truecolor hex would risk rendering
 *     near-invisible text on a light-theme terminal (e.g. a near-white
 *     foreground hex on a white background) — ANSI names don't have that
 *     failure mode because the terminal itself resolves them.
 *
 *  2. Semantic / brand accents (`accent`, `success`, `warning`, `error`,
 *     `info`, `agent`, `borderActive`, `highlight`, `role.*`, `syntax.*`)
 *     are promoted to truecolor hex when the terminal supports it, so the
 *     palette reads as an intentional, designed hue set rather than the
 *     8 basic ANSI colors every other CLI uses. Each hex value is chosen
 *     at a mid lightness so it holds contrast against both black and
 *     white backgrounds.
 *
 * Ink passes color strings straight to chalk, which already downgrades
 * truecolor hex to the nearest ANSI-256/16 color when it detects a
 * lower-capability terminal — this module's `detectColorSupport()` is a
 * belt-and-suspenders layer on top of that, for the cases the brief calls
 * out explicitly (`FORCE_COLOR`, `COLORTERM`) plus a couple of well-known
 * terminal fingerprints, so the *fallback string itself* (not just the
 * rendered bytes) is a plain ANSI name — useful in contexts that don't go
 * through chalk's downsampling at all (e.g. logging, snapshot tests).
 */

export type ColorSupport = 'truecolor' | 'fallback';

/** Terminal programs known to render 24-bit color reliably even when
 * `COLORTERM` doesn't survive a intermediate hop (tmux/ssh/etc). */
const TRUECOLOR_TERM_PROGRAMS = new Set(['vscode', 'iTerm.app', 'WezTerm', 'Hyper']);

/**
 * Explicit truecolor capability check. Conservative by default — falls
 * back to plain ANSI unless there's positive evidence of 24-bit support.
 */
export function detectColorSupport(env: NodeJS.ProcessEnv = process.env): ColorSupport {
  // Explicit opt-out wins over everything.
  if (env.FORCE_COLOR === '0' || env.FORCE_COLOR === 'false') return 'fallback';
  // Explicit opt-in.
  if (env.FORCE_COLOR === '3' || env.FORCE_COLOR === 'truecolor') return 'truecolor';
  // De-facto standard signal, set by most modern terminals.
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor';
  // Windows Terminal supports truecolor but doesn't always set COLORTERM.
  if (env.WT_SESSION) return 'truecolor';
  if (env.TERM_PROGRAM && TRUECOLOR_TERM_PROGRAMS.has(env.TERM_PROGRAM)) return 'truecolor';
  return 'fallback';
}

export const colorSupport: ColorSupport = detectColorSupport();

// ── Accent palette (truecolor + fallback pair) ──────────────────────────
const ACCENTS_TRUECOLOR = {
  accent: '#22b8cf',
  accentDim: '#0b7285',
  success: '#2f9e44',
  warning: '#c9820a',
  error: '#e03131',
  info: '#3573e0',
  agent: '#8b5cf6',
  borderActive: '#22b8cf',
  highlight: '#22b8cf',
} as const;

const ACCENTS_FALLBACK = {
  accent: 'cyan',
  accentDim: 'gray',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  agent: 'magenta',
  borderActive: 'cyan',
  highlight: 'cyan',
} as const;

const ROLE_TRUECOLOR: Record<AgentRole, string> = {
  writer: '#2f9e44',
  reviewer: '#3573e0',
  challenger: '#c9820a',
  synthesizer: '#8b5cf6',
  planner: '#22b8cf',
  researcher: '#94a3b8',
  summarizer: '#6b7280',
};

const ROLE_FALLBACK: Record<AgentRole, string> = {
  writer: 'green',
  reviewer: 'blue',
  challenger: 'yellow',
  synthesizer: 'magenta',
  planner: 'cyan',
  researcher: 'white',
  summarizer: 'gray',
};

const SYNTAX_TRUECOLOR = {
  keyword: '#8b5cf6',
  string: '#2f9e44',
  comment: 'gray',
  number: '#c9820a',
  function: '#22b8cf',
  type: '#3573e0',
  plain: 'white',
} as const;

const SYNTAX_FALLBACK = {
  keyword: 'magenta',
  string: 'green',
  comment: 'gray',
  number: 'yellow',
  function: 'cyan',
  type: 'blue',
  plain: 'white',
} as const;

const accents = colorSupport === 'truecolor' ? ACCENTS_TRUECOLOR : ACCENTS_FALLBACK;
const roleColorMap = colorSupport === 'truecolor' ? ROLE_TRUECOLOR : ROLE_FALLBACK;
const syntaxColorMap = colorSupport === 'truecolor' ? SYNTAX_TRUECOLOR : SYNTAX_FALLBACK;

export const zen = {
  bg: 'black',
  fg: 'white',
  muted: 'gray',
  panel: 'gray',
  border: 'gray',
  ...accents,
  // Role hues — keep in sync with `roleColors` below.
  role: roleColorMap,
  // Syntax highlighting palette — consumed by syntax.ts / markdown.tsx.
  syntax: syntaxColorMap,
};

// ── Text hierarchy ───────────────────────────────────────────────────────
// Three consistent weights, spread across every component instead of ad
// hoc `dimColor`/`bold` combinations. Spread onto `<Text {...hierarchy.x}>`.
export const hierarchy = {
  /** Headlines, selected rows, anything that should anchor the eye first. */
  primary: { bold: true, color: zen.fg } as const,
  /** Normal body copy — the default reading weight. */
  secondary: { color: zen.fg } as const,
  /** De-emphasized metadata: timestamps, hints, placeholders. */
  tertiary: { dimColor: true, color: zen.muted } as const,
};

// ── Spacing scale ────────────────────────────────────────────────────────
// Terminal rows/cols are integers, so this is intentionally small. Applied
// uniformly instead of scattering bare `marginTop={1}` throughout.
export const SPACING = {
  none: 0,
  sm: 1,
  md: 2,
  lg: 3,
} as const;

// ── Border treatment ─────────────────────────────────────────────────────
// One border style for every panel in the app (previously an arbitrary mix
// of 'round' / 'single' / 'double'). Focus/emphasis is communicated purely
// through color: `zen.borderActive` for focused/live panels, `zen.border`
// for everything else.
export const PANEL_BORDER = 'round' as const;

/** Resolve the border color for a panel given its focus state. */
export function panelBorderColor(focused: boolean): string {
  return focused ? zen.borderActive : zen.border;
}

// ── Layout constants ──────────────────────────────────────────────────
export const MIN_COLUMNS = 80;
export const MIN_ROWS = 24;
export const SIDEBAR_MIN_WIDTH = 28;
export const SIDEBAR_MAX_WIDTH = 45;
export const SIDEBAR_CONTENT_OVERHEAD = 9;

// ── Mode metadata (single source of truth) ────────────────────────────
export interface ModeMeta {
  icon: string;
  label: string;
  description: string;
  /** Tier-aware description copy; `intermediate` mirrors `description`. */
  desc: { beginner: string; intermediate: string; advanced: string };
}

export const MODES: Mode[] = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];

export const MODE_META: Record<Mode, ModeMeta> = {
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

// ── Preset (deliberation) metadata (single source of truth) ───────────
export interface PresetMeta {
  icon: string;
  label: string;
  description: string;
  desc: { beginner: string; intermediate: string; advanced: string };
}

export const PRESETS: DeliberationMode[] = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm', 'merge'];

export const PRESET_META: Record<DeliberationMode, PresetMeta> = {
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
export function tiered<T>(
  msg: { beginner: T; intermediate: T; advanced: T },
  model?: { tier(): SkillTier },
): T {
  return msg[model?.tier() ?? 'intermediate'];
}

// ── Color helpers ──────────────────────────────────────────────────────

/** Safe role color lookup (never throws, always returns a valid ink color). */
export function roleColors(role: AgentRole): string {
  return zen.role[role] ?? zen.muted;
}

/** Identity passthrough — documents that a string is a theme color. */
export function c(color: string): string {
  return color;
}
