"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentYamlSchema = void 0;
exports.validateAgentYaml = validateAgentYaml;
exports.safeValidateAgentYaml = safeValidateAgentYaml;
const zod_1 = require("zod");
/**
 * Agent YAML Schema — Declarative agent definitions.
 * Modeled after Omnigent's agent.yaml spec, adapted for Chimera's
 * provider-agnostic, multi-agent architecture.
 *
 * Usage:
 *   name: code-reviewer
 *   prompt: |
 *     You are a code reviewer. Review diffs for correctness,
 *     security, and maintainability. Return structured findings.
 *   executor:
 *     provider: anthropic
 *     model: claude-sonnet-4-20250514
 *   tools:
 *     git_diff: inherit
 *     read_file: inherit
 *     linter:
 *       type: function
 *       callable: chimera-tools.linter.run
 */
// Tool definition — function, MCP, or sub-agent
const FunctionToolSchema = zod_1.z.object({
    type: zod_1.z.literal('function'),
    callable: zod_1.z.string().describe('Module path and function name (e.g., chimera-tools.linter.run)'),
    description: zod_1.z.string().optional(),
});
const McpToolSchema = zod_1.z.object({
    type: zod_1.z.literal('mcp'),
    url: zod_1.z.string().url().or(zod_1.z.string().startsWith('stdio:')).describe('MCP server URL or stdio command'),
    description: zod_1.z.string().optional(),
});
const AgentToolSchema = zod_1.z.object({
    type: zod_1.z.literal('agent'),
    prompt: zod_1.z.string().describe('System prompt for the sub-agent'),
    tools: zod_1.z.record(zod_1.z.union([zod_1.z.literal('inherit'), FunctionToolSchema, McpToolSchema])).optional(),
    description: zod_1.z.string().optional(),
});
const ToolSchema = zod_1.z.union([FunctionToolSchema, McpToolSchema, AgentToolSchema]);
const ToolMapSchema = zod_1.z.record(zod_1.z.union([zod_1.z.literal('inherit'), ToolSchema]));
// Executor configuration — which provider/model to use
const ExecutorSchema = zod_1.z.object({
    provider: zod_1.z.string().describe('Provider name (anthropic, openai, openrouter, ollama, google)'),
    model: zod_1.z.string().describe('Model identifier'),
    harness: zod_1.z.enum(['chimera', 'claude-code', 'codex', 'opencode', 'pi']).optional()
        .describe('Agent harness to use (default: chimera)'),
});
// Role-specific configuration
const RoleSchema = zod_1.z.enum(['writer', 'reviewer', 'challenger', 'synthesizer', 'planner', 'researcher', 'summarizer']);
// Agent YAML schema
exports.AgentYamlSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).describe('Unique agent name (kebab-case recommended)'),
    description: zod_1.z.string().optional().describe('Human-readable description of the agent'),
    prompt: zod_1.z.string().describe('System prompt for the agent'),
    executor: ExecutorSchema.describe('Provider and model configuration'),
    tools: ToolMapSchema.optional().describe('Available tools (inherit from parent or define new)'),
    role: RoleSchema.optional().describe('Agent role (default: writer)'),
    constraints: zod_1.z.object({
        maxTokensPerTurn: zod_1.z.number().positive().optional(),
        costCapPerTask: zod_1.z.number().nonnegative().optional(),
        costCapPerSession: zod_1.z.number().nonnegative().optional(),
        maxParallelInstances: zod_1.z.number().positive().optional(),
    }).optional().describe('Resource constraints for this agent'),
    hooks: zod_1.z.object({
        preToolCall: zod_1.z.string().optional().describe('Hook function to run before tool calls'),
        postToolCall: zod_1.z.string().optional().describe('Hook function to run after tool calls'),
        onError: zod_1.z.string().optional().describe('Hook function to run on errors'),
    }).optional().describe('Lifecycle hooks'),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional().describe('Arbitrary metadata for the agent'),
});
/**
 * Validate an agent YAML object.
 * Returns the validated agent or throws a ZodError with details.
 */
function validateAgentYaml(data) {
    return exports.AgentYamlSchema.parse(data);
}
/**
 * Safe validation — returns result object instead of throwing.
 */
function safeValidateAgentYaml(data) {
    const result = exports.AgentYamlSchema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
//# sourceMappingURL=agent-schema.js.map