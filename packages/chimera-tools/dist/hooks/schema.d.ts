/**
 * Hook system schemas and types for chimera.
 *
 * Supports events: PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd,
 * SubagentStart, SubagentStop, UserPromptSubmit, and custom events.
 */
import { z } from 'zod';
export declare const HookEventSchema: z.ZodEnum<["pre-tool-use", "post-tool-use", "pre-execution", "post-execution", "stop", "session-start", "session-end", "subagent-start", "subagent-stop", "user-prompt-submit", "budget-warning", "error"]>;
export type HookEvent = z.infer<typeof HookEventSchema>;
export declare const HookDefinitionSchema: z.ZodObject<{
    /** Unique hook identifier */
    id: z.ZodString;
    /** Event to listen for */
    event: z.ZodEnum<["pre-tool-use", "post-tool-use", "pre-execution", "post-execution", "stop", "session-start", "session-end", "subagent-start", "subagent-stop", "user-prompt-submit", "budget-warning", "error"]>;
    /** Script path or inline command */
    command: z.ZodOptional<z.ZodString>;
    /** Inline script content (alternative to command) */
    script: z.ZodOptional<z.ZodString>;
    /** Working directory for the hook */
    cwd: z.ZodOptional<z.ZodString>;
    /** Environment variables to pass */
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    /** Timeout in ms (default: 30000) */
    timeout: z.ZodDefault<z.ZodNumber>;
    /** Whether this hook can modify the tool params */
    canModify: z.ZodDefault<z.ZodBoolean>;
    /** Priority (lower runs first) */
    priority: z.ZodDefault<z.ZodNumber>;
    /** Whether this hook is enabled */
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Filter: only run if tool name matches */
    toolFilter: z.ZodOptional<z.ZodString>;
    /** Filter: only run if event data matches pattern */
    dataFilter: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timeout?: number;
    cwd?: string;
    command?: string;
    env?: Record<string, string>;
    priority?: number;
    id?: string;
    enabled?: boolean;
    event?: "error" | "pre-tool-use" | "post-tool-use" | "pre-execution" | "post-execution" | "stop" | "session-start" | "session-end" | "subagent-start" | "subagent-stop" | "user-prompt-submit" | "budget-warning";
    script?: string;
    canModify?: boolean;
    toolFilter?: string;
    dataFilter?: string;
}, {
    timeout?: number;
    cwd?: string;
    command?: string;
    env?: Record<string, string>;
    priority?: number;
    id?: string;
    enabled?: boolean;
    event?: "error" | "pre-tool-use" | "post-tool-use" | "pre-execution" | "post-execution" | "stop" | "session-start" | "session-end" | "subagent-start" | "subagent-stop" | "user-prompt-submit" | "budget-warning";
    script?: string;
    canModify?: boolean;
    toolFilter?: string;
    dataFilter?: string;
}>;
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;
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
//# sourceMappingURL=schema.d.ts.map