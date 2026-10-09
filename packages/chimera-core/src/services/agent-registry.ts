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
  /** Current in-flight instances */
  inFlight: number;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
}

export interface RegisterAgentConfig {
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
}

/**
 * AgentRegistry — wraps AgentMesh to provide the domain interface.
 * Manages agent lifecycle, capability queries, health tracking, and concurrency.
 */
export class AgentRegistry {
  private mesh: AgentMesh;
  private agents: Map<string, AgentRecord> = new Map();
  private agentCounter = 0;

  constructor(eventStreamOrMesh?: EventStream | AgentMesh) {
    if (eventStreamOrMesh instanceof AgentMesh) {
      this.mesh = eventStreamOrMesh;
    } else {
      this.mesh = new AgentMesh(eventStreamOrMesh ?? new EventStream());
    }
  }

  /**
   * Generate a unique agent ID.
   */
  generateAgentId(): string {
    return `agent-${++this.agentCounter}`;
  }

  /**
   * Register an agent with capabilities and constraints.
   */
  registerAgent(config: RegisterAgentConfig): void {
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
      inFlight: 0,
      lastHeartbeat: Date.now(),
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
      agent.lastHeartbeat = Date.now();
    }
  }

  /**
   * Start an agent (transition to 'running').
   */
  startAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === 'failed' || agent.status === 'stopped') {
      return false;
    }
    agent.status = 'running';
    agent.inFlight++;
    agent.lastHeartbeat = Date.now();
    return true;
  }

  /**
   * Stop an agent (decrement in-flight, transition to 'ready').
   */
  stopAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.inFlight = Math.max(0, agent.inFlight - 1);
      if (agent.inFlight === 0 && agent.status === 'running') {
        agent.status = 'ready';
      }
      agent.lastHeartbeat = Date.now();
    }
  }

  /**
   * Check if an agent can accept more work.
   */
  canAcceptWork(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    if (agent.status === 'failed' || agent.status === 'stopped') return false;
    return agent.inFlight < agent.maxParallelInstances;
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
   * Get agents eligible for a role (healthy, can accept work).
   */
  getEligibleAgents(role: string): string[] {
    return [...this.agents.values()]
      .filter((a) => a.role === role && this.canAcceptWork(a.id))
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
      // Auto-fail agent after 5 consecutive failures
      if (agent.consecutiveFailures >= 5) {
        agent.status = 'failed';
      }
    }
    agent.successRate = Math.max(0, (agent.totalRuns - agent.consecutiveFailures) / agent.totalRuns);
    agent.lastHeartbeat = Date.now();
    // Stop the agent (decrement in-flight)
    this.stopAgent(agentId);
  }

  /**
   * Get the underlying AgentMesh (for backward compatibility).
   */
  getMesh(): AgentMesh {
    return this.mesh;
  }

  /**
   * Get registry statistics.
   */
  getStats(): {
    total: number;
    healthy: number;
    failed: number;
    inFlight: number;
    byRole: Record<string, number>;
  } {
    const agents = [...this.agents.values()];
    const byRole: Record<string, number> = {};
    for (const a of agents) {
      byRole[a.role] = (byRole[a.role] ?? 0) + 1;
    }
    return {
      total: agents.length,
      healthy: agents.filter((a) => a.status !== 'failed' && a.status !== 'stopped').length,
      failed: agents.filter((a) => a.status === 'failed').length,
      inFlight: agents.reduce((sum, a) => sum + a.inFlight, 0),
      byRole,
    };
  }
}
