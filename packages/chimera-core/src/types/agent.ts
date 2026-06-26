export type AgentRole = 'writer' | 'reviewer' | 'challenger' | 'synthesizer' | 'planner' | 'researcher' | 'summarizer';

export type Mode = 'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal' | 'auto';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  result: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    duration: number;
  };
}

export interface AgentConfig {
  id: string;
  role: AgentRole;
  provider: string;
  model: string;
  constraints: {
    maxTokensPerTurn: number;
    costCapPerTask: number;
    costCapPerSession: number;
    costCapPerDay: number;
    maxParallelInstances: number;
    rateLimitRpm: number;
  };
}
