/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * Regenerate with: bun run generate:bundled
 * Verify up-to-date:  bun run check:bundled
 *
 * Source of truth:
 *   .archon/commands/defaults/*.md
 *   .archon/workflows/defaults/*.{yaml,yml}
 *
 * Contents are inlined as plain string literals (JSON-escaped) so this
 * module loads in both Bun and Node. Previous versions used
 * `import X from '...' with { type: 'text' }` which is Bun-specific.
 */

// Bundled default commands
export const BUNDLED_COMMANDS: Record<string, string> = {
  "archon-assist": "---\ndescription: General assistance - questions, debugging, one-off tasks, exploration\nargument-hint: <any request>\n---\n\n# Assist Mode\n\n**Request**: $ARGUMENTS\n\n---\n\nYou are helping with a request that didn't match a specific workflow.\n\n## Instructions\n\n1. **Understand the request** - What is the user actually asking for?\n2. **Take action** - Use your full Claude Code capabilities to help\n3. **Be helpful** - Answer questions, debug issues, explore code, make changes\n4. **Note the gap** - If this should have been a specific workflow, mention it:\n   \"Note: Using assist mode. Consider creating a workflow for this use case.\"\n\n## Capabilities\n\nYou have full Claude Code capabilities:\n- Read and write files\n- Run commands\n- Search the codebase\n- Make code changes\n- Answer questions\n\n## Request\n\n$ARGUMENTS\n",
};

// Bundled default workflows
export const BUNDLED_WORKFLOWS: Record<string, string> = {
  "archon-assist": "name: archon-assist\ndescription: |\n  Use when: No other workflow matches the request.\n  Handles: Questions, debugging, exploration, one-off tasks, explanations, CI failures, general help.\n  Capability: Full Claude Code agent with all tools available.\n  Note: Will inform user when assist mode is used for tracking.\n\n# Run in the live checkout, not in a fresh sub-worktree. Without this, every\n# auto-routed `archon-assist` invocation creates an isolated sub-worktree\n# whose edits are unreachable from the calling chat (no commit step, no\n# branch propagation back). With `worktree.enabled: false`, edits land in\n# the parent's working tree where syncWorkspace's #1516 fast-forward\n# default keeps them safe across chat ticks. Closes #1546.\nworktree:\n  enabled: false\n\nnodes:\n  - id: assist\n    command: archon-assist\n",
};
