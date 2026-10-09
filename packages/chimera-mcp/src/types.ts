// =============================================================================
// MCP (Model Context Protocol) Adapter — Types
// =============================================================================

import { z } from 'zod';

/**
 * MCP Server Configuration
 */
export const McpServerConfigSchema = z.object({
  /** Unique identifier for this server */
  id: z.string().min(1),
  /** Server display name */
  name: z.string().min(1),
  /** Transport type */
  transport: z.enum(['stdio', 'sse', 'http']),
  /** Command to execute (for stdio) */
  command: z.string().optional(),
  /** Arguments for the command */
  args: z.array(z.string()).optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** URL for SSE/HTTP transport */
  url: z.string().url().optional(),
  /** Request timeout in ms */
  timeoutMs: z.number().int().min(1).default(30_000),
  /** Max retry attempts */
  maxRetries: z.number().int().min(0).max(5).default(2),
  /** Whether to auto-discover tools on connect */
  autoDiscover: z.boolean().default(true),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * MCP Tool Definition — represents a tool exposed by an MCP server
 */
export interface McpTool {
  /** Tool name (unique within server) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
  /** Server this tool belongs to */
  serverId: string;
  /** Tool category for permission mapping */
  category: 'filesystem' | 'shell' | 'git' | 'network' | 'lsp' | 'mcp' | 'browser' | 'internal';
  /** Whether this tool requires explicit user approval */
  requiresApproval: boolean;
  /** Timeout override (ms) — uses server default if not set */
  timeoutMs?: number;
}

/**
 * MCP Tool Call Request
 */
export interface McpToolCall {
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Caller context */
  context: {
    sessionId: string;
    runId: string;
    agentId: string;
  };
  /** Request timeout */
  timeoutMs?: number;
}

/**
 * MCP Tool Call Result
 */
export interface McpToolResult {
  /** Whether the call succeeded */
  success: boolean;
  /** Result data */
  data?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Server that handled the call */
  serverId: string;
}

/**
 * MCP Resource — represents a server resource (file, database, etc.)
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP Prompt — represents a server prompt template
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}
