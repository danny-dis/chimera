import { z } from 'zod';

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
const FunctionToolSchema = z.object({
  type: z.literal('function'),
  callable: z.string().describe('Module path and function name (e.g., chimera-tools.linter.run)'),
  description: z.string().optional(),
});

const McpToolSchema = z.object({
  type: z.literal('mcp'),
  url: z.string().url().or(z.string().startsWith('stdio:')).describe('MCP server URL or stdio command'),
  description: z.string().optional(),
});

const AgentToolSchema = z.object({
  type: z.literal('agent'),
  prompt: z.string().describe('System prompt for the sub-agent'),
  tools: z.record(z.union([z.literal('inherit'), FunctionToolSchema, McpToolSchema])).optional(),
  description: z.string().optional(),
});

const ToolSchema = z.union([FunctionToolSchema, McpToolSchema, AgentToolSchema]);
const ToolMapSchema = z.record(z.union([z.literal('inherit'), ToolSchema]));

// Executor configuration — which provider/model to use
const ExecutorSchema = z.object({
  provider: z.string().describe('Provider name (anthropic, openai, openrouter, ollama, google)'),
  model: z.string().describe('Model identifier'),
  harness: z.enum(['chimera', 'claude-code', 'codex', 'opencode', 'pi']).optional()
    .describe('Agent harness to use (default: chimera)'),
});

// Role-specific configuration
const RoleSchema = z.enum(['writer', 'reviewer', 'challenger', 'synthesizer', 'planner', 'researcher', 'summarizer']);

// Agent YAML schema
export const AgentYamlSchema = z.object({
  name: z.string().min(1).describe('Unique agent name (kebab-case recommended)'),
  description: z.string().optional().describe('Human-readable description of the agent'),
  prompt: z.string().describe('System prompt for the agent'),
  executor: ExecutorSchema.describe('Provider and model configuration'),
  tools: ToolMapSchema.optional().describe('Available tools (inherit from parent or define new)'),
  role: RoleSchema.optional().describe('Agent role (default: writer)'),
  constraints: z.object({
    maxTokensPerTurn: z.number().positive().optional(),
    costCapPerTask: z.number().nonnegative().optional(),
    costCapPerSession: z.number().nonnegative().optional(),
    maxParallelInstances: z.number().positive().optional(),
  }).optional().describe('Resource constraints for this agent'),
  hooks: z.object({
    preToolCall: z.string().optional().describe('Hook function to run before tool calls'),
    postToolCall: z.string().optional().describe('Hook function to run after tool calls'),
    onError: z.string().optional().describe('Hook function to run on errors'),
  }).optional().describe('Lifecycle hooks'),
  metadata: z.record(z.unknown()).optional().describe('Arbitrary metadata for the agent'),
});

export type AgentYaml = z.infer<typeof AgentYamlSchema>;
export type FunctionTool = z.infer<typeof FunctionToolSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;
export type AgentTool = z.infer<typeof AgentToolSchema>;
export type ToolDefinition = z.infer<typeof ToolSchema>;
export type ExecutorConfig = z.infer<typeof ExecutorSchema>;

/**
 * Validate an agent YAML object.
 * Returns the validated agent or throws a ZodError with details.
 */
export function validateAgentYaml(data: unknown): AgentYaml {
  return AgentYamlSchema.parse(data);
}

/**
 * Safe validation — returns result object instead of throwing.
 */
export function safeValidateAgentYaml(data: unknown): {
  success: true;
  data: AgentYaml;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = AgentYamlSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
