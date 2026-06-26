/**
 * Zod schemas for per-node hook configuration.
 * Ported from research/archon/packages/workflows/src/schemas/hooks.ts @ 2026-06-15.
 *
 * Slimmed for chimera: only `pre_run` is exposed for now. The full Claude SDK
 * hooks surface (PreToolUse, PostToolUse, etc.) is YAGNI until we wire the
 * Claude provider in @chimera/providers.
 */
import { z } from 'zod';

/**
 * Minimal per-node hooks shape for chimera.
 *
 * `pre_run` is a shell command that the executor runs inside the node's working
 * directory immediately before the node's primary action. Exit code 0 is
 * required to proceed; non-zero aborts the node. Reserved for future expansion
 * to per-event matchers (PreToolUse, PostToolUse, etc.) when chimera wires
 * provider-side hook callbacks.
 */
export const workflowNodeHooksSchema = z.object({
  /** Shell command run before the node's primary action. */
  pre_run: z.string().min(1, "'hooks.pre_run' must be a non-empty string").optional(),
});

export type WorkflowNodeHooks = z.infer<typeof workflowNodeHooksSchema>;
