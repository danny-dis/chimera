export type AgentRole = 'writer' | 'reviewer' | 'challenger' | 'synthesizer' | 'planner' | 'researcher' | 'summarizer';

export type Mode = 'ask' | 'plan' | 'code' | 'debug' | 'review' | 'oal';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

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
