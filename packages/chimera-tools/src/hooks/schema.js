"use strict";
/**
 * Hook system schemas and types for chimera.
 *
 * Supports events: PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd,
 * SubagentStart, SubagentStop, UserPromptSubmit, and custom events.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookDefinitionSchema = exports.HookEventSchema = void 0;
const zod_1 = require("zod");
// ── Hook event types ─────────────────────────────────────────────────────────
exports.HookEventSchema = zod_1.z.enum([
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
// ── Hook definition ──────────────────────────────────────────────────────────
exports.HookDefinitionSchema = zod_1.z.object({
    /** Unique hook identifier */
    id: zod_1.z.string(),
    /** Event to listen for */
    event: exports.HookEventSchema,
    /** Script path or inline command */
    command: zod_1.z.string().optional(),
    /** Inline script content (alternative to command) */
    script: zod_1.z.string().optional(),
    /** Working directory for the hook */
    cwd: zod_1.z.string().optional(),
    /** Environment variables to pass */
    env: zod_1.z.record(zod_1.z.string()).optional(),
    /** Timeout in ms (default: 30000) */
    timeout: zod_1.z.number().positive().default(30000),
    /** Whether this hook can modify the tool params */
    canModify: zod_1.z.boolean().default(false),
    /** Priority (lower runs first) */
    priority: zod_1.z.number().default(0),
    /** Whether this hook is enabled */
    enabled: zod_1.z.boolean().default(true),
    /** Filter: only run if tool name matches */
    toolFilter: zod_1.z.string().optional(),
    /** Filter: only run if event data matches pattern */
    dataFilter: zod_1.z.string().optional(),
});
//# sourceMappingURL=schema.js.map