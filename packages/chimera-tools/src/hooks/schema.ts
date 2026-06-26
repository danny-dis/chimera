/**
 * Hook system schemas and types for chimera.
 *
 * Supports events: PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd,
 * SubagentStart, SubagentStop, UserPromptSubmit, and custom events.
 */

import { z } from 'zod';

// ── Hook event types ─────────────────────────────────────────────────────────

export const HookEventSchema = z.enum([
  'pre-tool-use',
  'post-tool-use',
  'pre-execution',
  'post-execution',
  'stop',
  'session-start',
  'session-end',
  'subagent-start',
  'subagent-stop',
  'user-prompt-submit',
  'budget-warning',
  'error',
]);

export type HookEvent = z.infer<typeof HookEventSchema>;

// ── Hook definition ──────────────────────────────────────────────────────────

export const HookDefinitionSchema = z.object({
  /** Unique hook identifier */
  id: z.string(),
  /** Event to listen for */
  event: HookEventSchema,
  /** Script path or inline command */
  command: z.string().optional(),
  /** Inline script content (alternative to command) */
  script: z.string().optional(),
  /** Working directory for the hook */
  cwd: z.string().optional(),
  /** Environment variables to pass */
  env: z.record(z.string()).optional(),
  /** Timeout in ms (default: 30000) */
  timeout: z.number().positive().default(30000),
  /** Whether this hook can modify the tool params */
  canModify: z.boolean().default(false),
  /** Priority (lower runs first) */
  priority: z.number().default(0),
  /** Whether this hook is enabled */
  enabled: z.boolean().default(true),
  /** Filter: only run if tool name matches */
  toolFilter: z.string().optional(),
  /** Filter: only run if event data matches pattern */
  dataFilter: z.string().optional(),
});

export type HookDefinition = z.infer<typeof HookDefinitionSchema>;

// ── Hook execution context ───────────────────────────────────────────────────

export interface HookContext {
  /** Current workspace root */
  workspaceRoot: string;
  /** Current session id */
  sessionId: string;
  /** Event type being fired */
  event: HookEvent;
  /** Tool name (for tool-related events) */
  toolName?: string;
  /** Tool params (for pre/post tool events) */
  params?: Record<string, unknown>;
  /** Tool result (for post-execution events) */
  result?: unknown;
  /** Error (for error events) */
  error?: Error;
  /** Additional data depending on event type */
  data?: Record<string, unknown>;
}

export interface HookResult {
  /** Whether the hook ran successfully */
  success: boolean;
  /** Modified params (if canModify is true) */
  modifiedParams?: Record<string, unknown>;
  /** Modified result (if applicable) */
  modifiedResult?: unknown;
  /** Output from the hook script */
  output?: string;
  /** Error message if hook failed */
  error?: string;
  /** Duration in ms */
  duration: number;
}
