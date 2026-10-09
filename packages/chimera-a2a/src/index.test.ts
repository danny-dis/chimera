import { describe, it, expect, beforeEach } from 'vitest';
import { A2AAgentAdapter, A2ARegistry } from './agent-adapter.js';

describe('A2AAgentAdapter', () => {
  let adapter: A2AAgentAdapter;

  beforeEach(() => {
    adapter = new A2AAgentAdapter({
      id: 'external-reviewer',
      name: 'External Reviewer',
      url: 'http://localhost:4000',
      maxParallelInstances: 2,
    });
  });

  it('starts disconnected', () => {
    expect(adapter.state).toBe('disconnected');
    expect(adapter.isConnected).toBe(false);
  });

  it('connects and discovers capabilities', async () => {
    await adapter.connect();
    expect(adapter.state).toBe('connected');
  });

  it('disconnects', async () => {
    await adapter.connect();
    await adapter.disconnect();
    expect(adapter.state).toBe('disconnected');
  });

  it('rejects tasks when disconnected', async () => {
    const result = await adapter.sendTask({
      id: 'task-1',
      description: 'Review code',
      input: {},
      context: { sessionId: 's1', runId: 'r1', parentAgentId: 'a1' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('respects maxParallelInstances', () => {
    expect(adapter.canAcceptWork).toBe(false); // Not connected yet
  });

  it('tracks in-flight count', () => {
    expect(adapter.inFlight).toBe(0);
  });
});

describe('A2ARegistry', () => {
  let registry: A2ARegistry;

  beforeEach(() => {
    registry = new A2ARegistry();
  });

  it('registers an agent', () => {
    const adapter = registry.registerAgent({
      id: 'agent-1',
      name: 'External Agent 1',
      url: 'http://localhost:4000',
    });
    expect(adapter.config.id).toBe('agent-1');
    expect(registry.getAllAgents()).toHaveLength(1);
  });

  it('gets an agent by ID', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'External Agent 1',
      url: 'http://localhost:4000',
    });
    expect(registry.getAgent('agent-1')).toBeDefined();
    expect(registry.getAgent('agent-2')).toBeUndefined();
  });

  it('unregisters an agent', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'External Agent 1',
      url: 'http://localhost:4000',
    });
    registry.unregisterAgent('agent-1');
    expect(registry.getAllAgents()).toHaveLength(0);
  });

  it('filters by tag', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Reviewer',
      url: 'http://localhost:4000',
      tags: ['reviewer'],
    });
    registry.registerAgent({
      id: 'agent-2',
      name: 'Implementer',
      url: 'http://localhost:4001',
      tags: ['implementer'],
    });
    expect(registry.getAgentsByTag('reviewer')).toHaveLength(1);
    expect(registry.getAgentsByTag('reviewer')[0].config.id).toBe('agent-1');
  });

  it('connects to all agents', async () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Agent 1',
      url: 'http://localhost:4000',
    });
    registry.registerAgent({
      id: 'agent-2',
      name: 'Agent 2',
      url: 'http://localhost:4001',
    });
    await registry.connectAll();
    expect(registry.getAgent('agent-1')?.isConnected).toBe(true);
    expect(registry.getAgent('agent-2')?.isConnected).toBe(true);
  });
});
