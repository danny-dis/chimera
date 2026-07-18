// @chimera/learning — Adaptive guidance tiering + "get more value" surfacing.
//
// Two responsibilities:
//   1. Resolve a single user-facing message into the right DEPTH based on the
//      user's inferred skill (Step 3). Every touchpoint supplies a tiered
//      variant; features are NEVER gated — only explanation depth changes.
//   2. Surface one underused capability at a natural pause (Step 4), chosen by
//      skill level: beginners get the single next most useful feature (not a
//      list); advanced users get pointed at automation/config/API features.

import {
  UserSkillModel,
  type SkillTier,
  type ObservedCapability,
  type ExplainDepth,
} from './user-skill-model.js';

// ── Tiered message type ────────────────────────────────────────────────────

/**
 * A message authored at three depths. `beginner` explains WHY, offers a safe
 * default, and avoids/defines jargon. `advanced` is terse, states action +
 * result, and surfaces the power-user shortcut. `intermediate` is the
 * default middle ground (used when evidence is thin).
 */
export interface TieredMessage {
  beginner: string;
  intermediate: string;
  advanced: string;
}

/** Resolve the right string for the current skill tier. */
export function tierMessage(msg: TieredMessage, tier: SkillTier): string {
  return msg[tier];
}

/** Resolve by explanation depth (more explicit than tier). */
export function depthMessage(msg: TieredMessage, depth: ExplainDepth): string {
  switch (depth) {
    case 'full':
      return msg.beginner;
    case 'minimal':
      return msg.advanced;
    default:
      return msg.intermediate;
  }
}

// ── "Get more value" surfacing ─────────────────────────────────────────────

/**
 * Catalog of surfacable capabilities, with the copy for each tier and a flag
 * for whether it is more relevant to experts (automation/config/API) vs.
 * beginners (core workflow features).
 */
export interface CapabilityTip {
  id: ObservedCapability;
  /** Short label shown in logs / debugging. */
  label: string;
  /** Beginner copy: one concrete next step, no jargon pile-up. */
  beginner: string;
  /** Advanced copy: terse, points at the config/API surface. */
  advanced: string;
  /** True if this is primarily an expert/automation capability. */
  expertOriented: boolean;
}

export const CAPABILITY_TIPS: Record<ObservedCapability, CapabilityTip> = {
  preset: {
    id: 'preset',
    label: 'deliberation presets',
    beginner: 'Try `chimera code "your task"` first — Chimera uses a solo agent by default. When a task is big, add `--preset duo` or `trio` to split it across agents.',
    advanced: 'Automate parallel decomposition with `--preset trio|fusion|hive|swarm` (or set `defaults.preset` in .chimera/config.yaml).',
    expertOriented: true,
  },
  config: {
    id: 'config',
    label: 'config overrides',
    beginner: 'Run `chimera setup` to pick providers and save a config — you won\'t need to pass API keys on every command after that.',
    advanced: 'Override per-role models via CHIMERA_WRITER_MODEL / REVIEWER_MODEL / CHALLENGER_MODEL or edit .chimera/config.yaml directly.',
    expertOriented: true,
  },
  mcp: {
    id: 'mcp',
    label: 'MCP servers',
    beginner: 'You can connect external tools through MCP servers — see `/mcp` to list or add them in .chimera/config.yaml.',
    advanced: 'Wire custom tooling via MCP: add `mcp.servers[]` to .chimera/config.yaml and call tool-using agents directly.',
    expertOriented: true,
  },
  workflow: {
    id: 'workflow',
    label: 'workflows',
    beginner: 'If you repeat a task often, `chimera workflow` can save it as a reusable script.',
    advanced: 'Author reusable JS workflow scripts (`chimera workflow`) and dispatch them from session orchestration.',
    expertOriented: true,
  },
  loop: {
    id: 'loop',
    label: 'loop/goal',
    beginner: 'Need the same thing done N times? Try `/loop 5 "refactor this module"` in the REPL, or `chimera loop 5 "task"`.',
    advanced: 'Use `chimera loop <n> <task>` or `/loop` for bounded retries; `/goal` runs until a condition is met.',
    expertOriented: false,
  },
  goal: {
    id: 'goal',
    label: 'goal mode',
    beginner: 'Want Chimera to keep working until something is true? Try `chimera goal "all tests pass"`.',
    advanced: 'Drive open-ended runs with `chimera goal "<condition>"` (max 20 iterations, exits on COMPLETE).',
    expertOriented: false,
  },
  sessions: {
    id: 'sessions',
    label: 'sessions',
    beginner: 'Your work is saved automatically — type `/sessions` to see past runs, or `chimera resume <id>` to pick one up.',
    advanced: 'Resume/branch prior runs via `chimera resume <id>` or `/resume`; checkpoints live in .chimera/sessions/.',
    expertOriented: false,
  },
  export: {
    id: 'export',
    label: 'export',
    beginner: 'You can save a session with `/export` to keep a JSON copy of what you did.',
    advanced: 'Export session state with `/export` (chimera-export-<id>.json) for portability/teleport.',
    expertOriented: false,
  },
  hooks: {
    id: 'hooks',
    label: 'hooks',
    beginner: 'Chimera can run a script before/after tasks (hooks) — see `/hooks`.',
    advanced: 'Add pre/post-tool-use and lifecycle hooks via .chimera/hooks.yaml or .chimera/hooks/*.',
    expertOriented: true,
  },
  ide: {
    id: 'ide',
    label: 'IDE integration',
    beginner: 'Prefer an editor? Install the Chimera VS Code extension — it connects to the local daemon automatically.',
    advanced: 'Start `chimera daemon` and install the VS Code extension for in-editor control.',
    expertOriented: false,
  },
  vim: {
    id: 'vim',
    label: 'vim mode',
    beginner: 'If you use Vim, toggle it with `/vim`.',
    advanced: 'Enable Vim keybindings with `/vim` (persists to .chimera/config.yaml).',
    expertOriented: false,
  },
  teleport: {
    id: 'teleport',
    label: 'teleport',
    beginner: 'You can move a session to another machine with `/teleport <host>` (needs SSH).',
    advanced: 'Serialize + transfer a session across hosts via `/teleport <host>` (SSH + chimera on remote).',
    expertOriented: true,
  },
  eval: {
    id: 'eval',
    label: 'eval',
    beginner: 'Curious whether a change holds up? `chimera eval <taskRef>` runs a check on a task fixture.',
    advanced: 'Run regression/eval suites against task fixtures: `chimera eval <ref> --real`.',
    expertOriented: true,
  },
  doctor: {
    id: 'doctor',
    label: 'doctor',
    beginner: 'If something feels off, `/doctor` checks your providers, config, and memory in one go.',
    advanced: 'Run `/doctor` for a fast health check of providers/config/state before debugging.',
    expertOriented: false,
  },
  'custom-command': {
    id: 'custom-command',
    label: 'custom commands',
    beginner: 'You can make your own slash commands by adding markdown files to .chimera/commands/.',
    advanced: 'Extend the REPL with custom slash commands: .chimera/commands/*.md (or ~/.chimera/commands/).',
    expertOriented: true,
  },
  skill: {
    id: 'skill',
    label: 'skills',
    beginner: 'Chimera learns skills from your sessions — see `chimera skill list`.',
    advanced: 'Inspect/compose synthesized skills with `chimera skill` (backed by @chimera/learning).',
    expertOriented: false,
  },
  learn: {
    id: 'learn',
    label: 'learning engine',
    beginner: 'After each session Chimera saves what it learned — use `chimera learn` to review.',
    advanced: 'Drive skill/workflow synthesis manually via `chimera learn` (set --no-learn to disable auto).',
    expertOriented: true,
  },
};

// Order in which we suggest capabilities. Beginners get workflow-core first;
// advanced users get automation/config/API surface first.
const BEGINNER_ORDER: ObservedCapability[] = [
  'sessions', 'loop', 'goal', 'ide', 'doctor', 'export', 'skill', 'vim',
];
const ADVANCED_ORDER: ObservedCapability[] = [
  'preset', 'config', 'hooks', 'mcp', 'workflow', 'teleport', 'eval', 'learn', 'custom-command',
];

export interface ValueSuggestion {
  id: ObservedCapability;
  tip: string;
  /** Why this one (for inspectability). */
  reason: string;
}

/**
 * Pick the single most relevant un-touched capability to suggest at a natural
 * pause.
 *
 * @param model   the user-skill model (drives beginner vs advanced copy)
 * @param seen    capabilities the user has already used/touched (excluded)
 * @param opts    tuning: cap how many seen-before suggestions we cycle through
 */
export function suggestNextValue(
  model: UserSkillModel,
  seen: ObservedCapability[],
  opts: { maxFallbacks?: number } = {},
): ValueSuggestion | null {
  const tier = model.tier();
  const order = tier === 'advanced' ? ADVANCED_ORDER : BEGINNER_ORDER;

  const unseen = order.filter((c) => !seen.includes(c));
  // Beginners: a single next step. Advanced: a single step too (less noise),
  // but drawn from the expert-oriented pool above.
  const pick = unseen[0];
  if (pick) {
    return {
      id: pick,
      tip: tier === 'advanced' ? CAPABILITY_TIPS[pick].advanced : CAPABILITY_TIPS[pick].beginner,
      reason: `tier=${tier}; first unseen in ${tier} order`,
    };
  }

  // All primary candidates seen — optionally cycle a fallback so a returning
  // user still gets a nudge (bounded to avoid loops).
  const fallbacks = order.filter((c) => seen.includes(c)).slice(0, opts.maxFallbacks ?? 0);
  if (fallbacks.length > 0) {
    const fb = fallbacks[0]!;
    return {
      id: fb,
      tip: (tier === 'advanced' ? CAPABILITY_TIPS[fb].advanced : CAPABILITY_TIPS[fb].beginner),
      reason: `all primary unseen exhausted; fallback (maxFallbacks=${opts.maxFallbacks ?? 0})`,
    };
  }
  return null;
}

// ── Self-built output style ────────────────────────────────────────────────
//
// The repo already has an `OutputStyle` mechanism (loaded from
// `.chimera/output-styles/*.md` and injected via `buildStylePrompt`). This
// synthesizes one from the existing `UserSkillModel` audit so the agent's
// voice evolves from observed behavior — no new module, no ML. Heuristic only.
//
// ponytail: single global auto-style, synth from tier + audit flags. Per-workspace
// or richer (session-outcome-weighted) styles if a user wants different voices.

import { promises as fs } from 'fs';
import { join } from 'path';
import type { OutputStyle } from '@chimera/core';

const AUTO_STYLE_NAME = 'auto';
const AUTO_STYLE_FILE = 'auto.chimera-style.md';

/** Build style instructions from a user-skill model. Pure. */
export function synthesizeStyle(model?: UserSkillModel): { name: string; description: string; instructions: string } {
  const tier = model?.tier() ?? 'intermediate';
  const audit = model?.getAuditLog() ?? [];
  const repeatedErrors = audit.some((e) => e.signal === 'repeated-errors');

  const lines: string[] = ['# Auto Style (self-built from your usage)'];
  if (tier === 'beginner') {
    lines.push('- Friendly, conversational tone', '- Explain the WHY before the HOW', '- Define jargon on first use', '- Lead with a safe default, not a menu of options');
  } else if (tier === 'advanced') {
    lines.push('- Terse, direct', '- Code-first, explain only if asked', '- Surface the power-user shortcut/keybinding', '- No preamble or postamble');
  } else {
    lines.push('- Clear, direct', '- Show the answer, then a short rationale');
  }
  if (repeatedErrors) {
    lines.push('- When stuck, show the root cause first, then the fix — not a list of guesses');
  }
  return {
    name: AUTO_STYLE_NAME,
    description: `Self-built from ${tier} skill signals`,
    instructions: lines.join('\n'),
  };
}

/**
 * Resolve the active output style for a workspace. Prefers an explicit
 * user-authored style (any .md in .chimera/output-styles); otherwise
 * synthesizes one from behavior and persists it so it is inspectable and
 * reversible. Returns undefined if no style applies (caller no-ops).
 */
export async function resolveActiveStyle(
  workspaceRoot?: string,
  model?: UserSkillModel,
): Promise<OutputStyle | undefined> {
  const dir = workspaceRoot ? join(workspaceRoot, '.chimera', 'output-styles') : undefined;
  if (dir) {
    try {
      const entries = await fs.readdir(dir);
      // Any user file other than the auto one wins.
      const userFile = entries.find((f) => f.endsWith('.md') && f !== AUTO_STYLE_FILE);
      if (userFile) {
        const { loadOutputStyles } = await import('@chimera/core');
        return (await loadOutputStyles(workspaceRoot)).find((s) => s.name !== AUTO_STYLE_NAME);
      }
    } catch {
      // no dir yet — fall through to synth
    }
  }
  if (!model) return undefined;
  const synth = synthesizeStyle(model);
  const style: OutputStyle = {
    name: synth.name,
    description: synth.description,
    keepCodingInstructions: true,
    instructions: synth.instructions,
    sourcePath: dir ? join(dir, AUTO_STYLE_FILE) : '(synthesized)',
  };
  // Persist so the user can read/edit/delete it (chimera learn --reset-style).
  if (dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, AUTO_STYLE_FILE), `---\nname: ${synth.name}\ndescription: ${synth.description}\nkeep-coding-instructions: true\n---\n\n${synth.instructions}\n`, 'utf-8');
    } catch {
      // best-effort; in-memory style still returned
    }
  }
  return style;
}

/** Delete the self-built auto style for a workspace. Returns true if removed. */
export async function resetAutoStyle(workspaceRoot: string): Promise<boolean> {
  const file = join(workspaceRoot, '.chimera', 'output-styles', AUTO_STYLE_FILE);
  try {
    await fs.unlink(file);
    return true;
  } catch {
    return false;
  }
}
