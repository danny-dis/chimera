import type { Mode, DeliberationMode, AgentRole } from '@chimera/core';

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
  } as Record<AgentRole, string>,
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
} as const;

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
}

export const MODES: Mode[] = ['auto', 'ask', 'plan', 'code', 'debug', 'review', 'oal'];

export const MODE_META: Record<Mode, ModeMeta> = {
  ask: { icon: '?', label: 'Ask', description: 'Quick Q&A' },
  plan: { icon: '◈', label: 'Plan', description: 'Plan changes' },
  code: { icon: '⚡', label: 'Code', description: 'Write code' },
  debug: { icon: '◉', label: 'Debug', description: 'Debug issues' },
  review: { icon: '◎', label: 'Review', description: 'Review code' },
  oal: { icon: '◆', label: 'OAL', description: 'OAL mode' },
  auto: { icon: '⟳', label: 'Auto', description: 'Auto-select mode' },
};

// ── Preset (deliberation) metadata (single source of truth) ───────────
export interface PresetMeta {
  icon: string;
  label: string;
  description: string;
}

export const PRESETS: DeliberationMode[] = ['auto', 'solo', 'duo', 'trio', 'hive', 'fusion', 'swarm'];

export const PRESET_META: Record<DeliberationMode, PresetMeta> = {
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
export function roleColors(role: AgentRole): string {
  return zen.role[role] ?? zen.muted;
}

/** Identity passthrough — documents that a string is a theme color. */
export function c(color: string): string {
  return color;
}
