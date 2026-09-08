import { AgentMesh } from '../agent-mesh.js';
import { EventStream } from '../event-stream.js';
import type { AgentConfig } from '../types/agent.js';
import type { AgentStatus } from '@chimera/domain';

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  model: string;
  provider: string;
  status: AgentStatus;
  capabilities: string[];
  maxTokensPerTurn: number;
  costCapPerTask: number;
  costCapPerSession: number;
  costCapPerDay: number;
  maxParallelInstances: number;
  rateLimitRpm: number;
  totalRuns: number;
  successRate: number;
  consecutiveFailures: number;
}

/**
 * AgentRegistry — wraps AgentMesh to provide the domain interface.
 * Manages agent lifecycle, capability queries, and health tracking.
 */
export class AgentRegistry {
  private mesh: AgentMesh;
  private agents: Map<string, AgentRecord> = new Map();

  constructor(eventStream?: EventStream) {
    this.mesh = new AgentMesh(eventStream ?? new EventStream());
  }

  /**
   * Register an agent with capabilities and constraints.
   */
  registerAgent(config: {
    id: string;
    name: string;
    role: string;
    model: string;
    provider: string;
    capabilities: string[];
    maxTokensPerTurn: number;
    costCapPerTask: number;
    costCapPerSession: number;
    costCapPerDay: number;
    maxParallelInstances: number;
    rateLimitRpm: number;
  }): void {
    const record: AgentRecord = {
      id: config.id,
      name: config.name,
      role: config.role,
      model: config.model,
      provider: config.provider,
      status: 'registered',
      capabilities: config.capabilities,
      maxTokensPerTurn: config.maxTokensPerTurn,
      costCapPerTask: config.costCapPerTask,
      costCapPerSession: config.costCapPerSession,
      costCapPerDay: config.costCapPerDay,
      maxParallelInstances: config.maxParallelInstances,
      rateLimitRpm: config.rateLimitRpm,
      totalRuns: 0,
      successRate: 1.0,
      consecutiveFailures: 0,
    };
    this.agents.set(config.id, record);
    // Also register with AgentMesh for backward compatibility
    this.mesh.registerAgent({
      id: config.id,
      role: config.role as any,
      provider: config.provider,
      model: config.model,
      constraints: {
        maxTokensPerTurn: config.maxTokensPerTurn,
        costCapPerTask: config.costCapPerTask,
        costCapPerSession: config.costCapPerSession,
        costCapPerDay: config.costCapPerDay,
        maxParallelInstances: config.maxParallelInstances,
        rateLimitRpm: config.rateLimitRpm,
      },
    });
  }

  /**
   * Update agent status.
   */
  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
    }
  }

  /**
   * Get agent by ID.
   */
  getAgent(agentId: string): AgentRecord | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * List all registered agents.
   */
  listAgents(): AgentRecord[] {
    return [...this.agents.values()];
  }

  /**
   * Get agents that have a specific capability.
   */
  getAgentsByCapability(capability: string): string[] {
    return [...this.agents.values()]
      .filter((a) => a.capabilities.includes(capability))
      .map((a) => a.id);
  }

  /**
   * Get agents by role.
   */
  getAgentsByRole(role: string): string[] {
    return [...this.agents.values()]
      .filter((a) => a.role === role)
      .map((a) => a.id);
  }

  /**
   * Get healthy agents (not failed or stopped).
   */
  getHealthyAgents(): string[] {
    return [...this.agents.values()]
      .filter((a) => a.status !== 'failed' && a.status !== 'stopped')
      .map((a) => a.id);
  }

  /**
   * Record an outcome for an agent (success or failure).
   */
  recordOutcome(agentId: string, success: boolean): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.totalRuns++;
    if (success) {
      agent.consecutiveFailures = 0;
    } else {
      agent.consecutiveFailures++;
    }
    // Simple success rate: assume prior runs were 100% success
    agent.successRate = Math.max(0, (agent.totalRuns - agent.consecutiveFailures) / agent.totalRuns);
  }

  /**
   * Get the underlying AgentMesh (for backward compatibility).
   */
  getMesh(): AgentMesh {
    return this.mesh;
  }
}
