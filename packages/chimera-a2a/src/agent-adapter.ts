// =============================================================================
// A2A Agent Adapter — connects to external A2A agents, sends tasks,
// and maps their capabilities into Chimera's agent interface.
// =============================================================================

import type {
  A2AAgentConfig,
  A2ACapability,
  A2ATask,
  A2AResult,
} from './types.js';

/**
 * Connection state for an A2A agent
 */
export type A2AConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * A2A Agent Adapter — manages connection to a single external A2A agent.
 * 
 * Discovers capabilities, sends tasks, and maps results back to Chimera format.
 */
export class A2AAgentAdapter {
  readonly config: A2AAgentConfig;
  private _state: A2AConnectionState = 'disconnected';
  private _capabilities: Map<string, A2ACapability> = new Map();
  private _error: string | null = null;
  private _inFlightCount = 0;

  constructor(config: A2AAgentConfig) {
    this.config = config;
  }

  // --- State ---

  get state(): A2AConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  get error(): string | null {
    return this._error;
  }

  get inFlight(): number {
    return this._inFlightCount;
  }

  get canAcceptWork(): boolean {
    return this.isConnected && this._inFlightCount < this.config.maxParallelInstances;
  }

  // --- Discovery ---

  get capabilities(): A2ACapability[] {
    return [...this._capabilities.values()];
  }

  getCapability(name: string): A2ACapability | undefined {
    return this._capabilities.get(name);
  }

  // --- Connection ---

  /**
   * Connect to the A2A agent and discover capabilities.
   */
  async connect(): Promise<void> {
    this._state = 'connecting';
    this._error = null;

    try {
      await this.fetchAgentCard();
      this._state = 'connected';
    } catch (err) {
      this._state = 'error';
      this._error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Disconnect from the agent.
   */
  async disconnect(): Promise<void> {
    this._state = 'disconnected';
    this._capabilities.clear();
  }

  /**
   * Reconnect (disconnect + connect).
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  // --- Task Execution ---

  /**
   * Send a task to the external agent.
   */
  async sendTask(task: A2ATask): Promise<A2AResult> {
    if (!this.isConnected) {
      return {
        taskId: task.id,
        success: false,
        error: `Agent ${this.config.id} is not connected (state: ${this._state})`,
        agentId: this.config.id,
        durationMs: 0,
        output: {},
      };
    }

    if (!this.canAcceptWork) {
      return {
        taskId: task.id,
        success: false,
        error: `Agent ${this.config.id} is at max capacity (${this._inFlightCount}/${this.config.maxParallelInstances})`,
        agentId: this.config.id,
        durationMs: 0,
        output: {},
      };
    }

    this._inFlightCount++;
    const startTime = Date.now();

    try {
      const result = await this.executeOnAgent(task);
      this._inFlightCount--;
      return {
        taskId: task.id,
        success: true,
        output: result,
        agentId: this.config.id,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      this._inFlightCount--;
      return {
        taskId: task.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        agentId: this.config.id,
        durationMs: Date.now() - startTime,
        output: {},
      };
    }
  }

  /**
   * Send multiple tasks in parallel (up to maxParallelInstances).
   */
  async sendTasks(tasks: A2ATask[]): Promise<A2AResult[]> {
    const results: A2AResult[] = [];
    for (const task of tasks) {
      const result = await this.sendTask(task);
      results.push(result);
    }
    return results;
  }

  // --- Private ---

  private async fetchAgentCard(): Promise<void> {
    // In production: fetch the agent card from config.url
    // For now, capabilities are empty until a real connection is made
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  private async executeOnAgent(task: A2ATask): Promise<Record<string, unknown>> {
    // In production: send A2A task to the agent
    // For now, return a mock result
    return { result: `Task ${task.id} executed on ${this.config.id}` };
  }
}

/**
 * A2ARegistry — manages multiple A2A agent connections.
 */
export class A2ARegistry {
  private agents = new Map<string, A2AAgentAdapter>();

  /**
   * Register an A2A agent.
   */
  registerAgent(config: A2AAgentConfig): A2AAgentAdapter {
    const adapter = new A2AAgentAdapter(config);
    this.agents.set(config.id, adapter);
    return adapter;
  }

  /**
   * Unregister an agent.
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.disconnect();
      this.agents.delete(agentId);
    }
  }

  /**
   * Get an agent adapter by ID.
   */
  getAgent(agentId: string): A2AAgentAdapter | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents.
   */
  getAllAgents(): A2AAgentAdapter[] {
    return [...this.agents.values()];
  }

  /**
   * Get all agents that can accept work.
   */
  getAvailableAgents(): A2AAgentAdapter[] {
    return [...this.agents.values()].filter(a => a.canAcceptWork);
  }

  /**
   * Find agents by tag.
   */
  getAgentsByTag(tag: string): A2AAgentAdapter[] {
    return [...this.agents.values()].filter(a => a.config.tags?.includes(tag));
  }

  /**
   * Connect to all registered agents.
   */
  async connectAll(): Promise<void> {
    const promises = [...this.agents.values()].map(agent =>
      agent.connect().catch(err => {
        console.error(`Failed to connect to A2A agent ${agent.config.id}:`, err);
      }),
    );
    await Promise.all(promises);
  }

  /**
   * Disconnect from all agents.
   */
  async disconnectAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.disconnect();
    }
  }
}
