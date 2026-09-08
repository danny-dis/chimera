// =============================================================================
// A2A (Agent-to-Agent) Adapter — Types
// =============================================================================

import { z } from 'zod';

/**
 * A2A Agent Configuration
 */
export const A2AAgentConfigSchema = z.object({
  /** Unique identifier */
  id: z.string().min(1),
  /** Agent display name */
  name: z.string().min(1),
  /** Agent description */
  description: z.string().optional(),
  /** URL for the A2A agent card */
  url: z.string().url(),
  /** Authentication (optional) */
  auth: z.object({
    type: z.enum(['none', 'bearer', 'api_key']),
    token: z.string().optional(),
  }).optional(),
  /** Maximum number of parallel instances */
  maxParallelInstances: z.number().int().min(1).max(10).default(1),
  /** Whether this agent is enabled */
  enabled: z.boolean().default(true),
  /** Tags for capability matching */
  tags: z.array(z.string()).optional(),
});
export type A2AAgentConfig = z.infer<typeof A2AAgentConfigSchema>;

/**
 * A2A Agent Capability — what an external agent can do
 */
export interface A2ACapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * A2A Task — request sent to an external agent
 */
export interface A2ATask {
  /** Unique task ID */
  id: string;
  /** Task description */
  description: string;
  /** Input data */
  input: Record<string, unknown>;
  /** Context from the caller */
  context: {
    sessionId: string;
    runId: string;
    parentAgentId: string;
  };
  /** Expected capability to use */
  capability?: string;
}

/**
 * A2A Result — response from an external agent
 */
export interface A2AResult {
  /** Task ID this result corresponds to */
  taskId: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Output data */
  output: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Agent that produced this result */
  agentId: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Confidence score (0-1) */
  confidence?: number;
}
