import { describe, it, expect, vi } from 'vitest';
import { AgentMesh } from '../agent-mesh.js';
import { EventStream } from '../event-stream.js';
import type { AgentConfig } from '../types/agent.js';

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: overrides.id ?? 'agent-1',
    role: overrides.role ?? 'writer',
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-4o',
    constraints: overrides.constraints ?? {
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 50,
      costCapPerDay: 100,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    },
  };
}

describe('AgentMesh', () => {
  it('registers an agent and retrieves it by id', () => {
    const mesh = new AgentMesh(new EventStream());
    const config = makeAgentConfig({ id: 'writer-1', role: 'writer' });

    mesh.registerAgent(config);

    const agent = mesh.getAgent('writer-1');
    expect(agent).toBeDefined();
    expect(agent?.id).toBe('writer-1');
    expect(agent?.role).toBe('writer');
  });

  it('appends agent_spawned event on registration', () => {
    const eventStream = new EventStream();
    const mesh = new AgentMesh(eventStream);
    const config = makeAgentConfig({ id: 'reviewer-1', role: 'reviewer', provider: 'anthropic', model: 'claude-haiku' });

    mesh.registerAgent(config);

    const events = eventStream.getByType('agent_spawned');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'agent_spawned',
      agentId: 'reviewer-1',
      role: 'reviewer',
      provider: 'anthropic',
      model: 'claude-haiku',
    });
  });

  it('getAgent returns undefined for non-existent id', () => {
    const mesh = new AgentMesh(new EventStream());
    expect(mesh.getAgent('nonexistent')).toBeUndefined();
  });

  it('getAgentsByRole filters agents correctly', () => {
    const mesh = new AgentMesh(new EventStream());
    mesh.registerAgent(makeAgentConfig({ id: 'w1', role: 'writer' }));
    mesh.registerAgent(makeAgentConfig({ id: 'r1', role: 'reviewer' }));
    mesh.registerAgent(makeAgentConfig({ id: 'w2', role: 'writer' }));

    const writers = mesh.getAgentsByRole('writer');
    expect(writers).toHaveLength(2);
    expect(writers.every((a) => a.role === 'writer')).toBe(true);
  });

  it('getAgentsByRole returns empty array if no matches', () => {
    const mesh = new AgentMesh(new EventStream());
    mesh.registerAgent(makeAgentConfig({ id: 'w1', role: 'writer' }));
    expect(mesh.getAgentsByRole('challenger')).toEqual([]);
  });

  it('executeQualityGate with draft, reviewer, and challenger', async () => {
    const eventStream = new EventStream();
    const mesh = new AgentMesh(eventStream);

    const result = await mesh.executeQualityGate({
      draftAgentId: 'writer-1',
      reviewerAgentId: 'reviewer-1',
      challengerAgentId: 'challenger-1',
      task: 'implement feature',
    });

    expect(result.verdict).toBe('pass');
    expect(result.output).toBe('');

    const events = eventStream.getAll();
    expect(events.find((e) => e.type === 'draft_proposed')).toBeDefined();
    expect(events.find((e) => e.type === 'verified')).toBeDefined();
    expect(events.find((e) => e.type === 'challenged')).toBeDefined();
  });

  it('executeQualityGate without challenger skips challenge stage', async () => {
    const eventStream = new EventStream();
    const mesh = new AgentMesh(eventStream);

    const result = await mesh.executeQualityGate({
      draftAgentId: 'writer-1',
      reviewerAgentId: 'reviewer-1',
      task: 'implement feature',
    });

    expect(result.verdict).toBe('pass');
    const events = eventStream.getAll();
    expect(events.find((e) => e.type === 'draft_proposed')).toBeDefined();
    expect(events.find((e) => e.type === 'verified')).toBeDefined();
    expect(events.find((e) => e.type === 'challenged')).toBeUndefined();
  });

  it('registers multiple agents with different roles', () => {
    const mesh = new AgentMesh(new EventStream());
    mesh.registerAgent(makeAgentConfig({ id: 'w1', role: 'writer' }));
    mesh.registerAgent(makeAgentConfig({ id: 'r1', role: 'reviewer' }));
    mesh.registerAgent(makeAgentConfig({ id: 'c1', role: 'challenger' }));

    expect(mesh.getAgent('w1')).toBeDefined();
    expect(mesh.getAgent('r1')).toBeDefined();
    expect(mesh.getAgent('c1')).toBeDefined();
  });

  it('overwrites agent with same id', () => {
    const mesh = new AgentMesh(new EventStream());
    mesh.registerAgent(makeAgentConfig({ id: 'a1', role: 'writer', model: 'gpt-4o' }));
    mesh.registerAgent(makeAgentConfig({ id: 'a1', role: 'reviewer', model: 'claude-haiku' }));

    const agent = mesh.getAgent('a1');
    expect(agent?.role).toBe('reviewer');
    expect(agent?.model).toBe('claude-haiku');
  });
});
