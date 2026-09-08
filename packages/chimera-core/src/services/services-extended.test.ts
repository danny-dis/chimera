import { describe, it, expect, beforeEach } from 'vitest';
import { ToolController } from './tool-controller.js';
import { AgentRegistry } from './agent-registry.js';
import { ModelSelector } from './model-selector.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { VerificationController } from './verification-controller.js';
import { ContextController } from './context-controller.js';
import { EventStream } from '../event-stream.js';

describe('ToolController', () => {
  let controller: ToolController;
  let registry: any;

  beforeEach(() => {
    registry = {
      tools: new Map(),
      register(tool: any) { this.tools.set(tool.name, tool); },
      get(name: string) { return this.tools.get(name); },
      getAll() { return [...this.tools.values()]; },
      has(name: string) { return this.tools.has(name); },
    };
    controller = new ToolController({ registry });
  });

  it('reports no tools without a registry', () => {
    const emptyController = new ToolController();
    expect(emptyController.getAvailableTools()).toEqual([]);
    expect(emptyController.hasTool('read_file')).toBe(false);
  });

  it('denies permission for unknown tools', () => {
    expect(controller.getToolPermission('unknown_tool', {})).toBe('deny');
  });

  it('executes a registered tool', async () => {
    controller.registerTool({
      name: 'echo',
      description: 'Echo input',
      execute: async (params) => ({ echo: params.value }),
      permissionLevel: 'read',
    });
    const result = await controller.executeTool({
      id: 'call-1',
      toolName: 'echo',
      args: { value: 'hello' },
      agentId: 'agent-1',
      runId: 'run-1',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echo: 'hello' });
  });

  it('tracks tool call history', async () => {
    controller.registerTool({
      name: 'noop',
      description: 'No operation',
      execute: async () => ({}),
      permissionLevel: 'read',
    });
    await controller.executeTool({
      id: 'call-1',
      toolName: 'noop',
      args: {},
      agentId: 'agent-1',
      runId: 'run-1',
      timestamp: Date.now(),
    });
    expect(controller.getToolCallHistory()).toHaveLength(1);
  });

  it('denies execute-level tools by default', () => {
    controller.registerTool({
      name: 'shell_run',
      description: 'Run shell command',
      execute: async () => ({}),
      permissionLevel: 'execute',
    });
    expect(controller.getToolPermission('shell_run', {})).toBe('ask');
  });

  it('filters tools by role', () => {
    controller.registerTool({
      name: 'read_file',
      description: 'Read a file',
      execute: async () => ({}),
      permissionLevel: 'read',
    });
    controller.registerTool({
      name: 'write_file',
      description: 'Write a file',
      execute: async () => ({}),
      permissionLevel: 'write',
    });
    controller.registerTool({
      name: 'shell_run',
      description: 'Run shell',
      execute: async () => ({}),
      permissionLevel: 'execute',
    });
    const reviewerTools = controller.getAvailableTools('reviewer');
    expect(reviewerTools).toContain('read_file');
    expect(reviewerTools).not.toContain('write_file');
    expect(reviewerTools).not.toContain('shell_run');
  });
});

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers agents', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Writer',
      role: 'writer',
      model: 'claude',
      provider: 'anthropic',
      capabilities: ['filesystem.read', 'filesystem.write'],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    const agent = registry.getAgent('agent-1');
    expect(agent).not.toBeNull();
    expect(agent?.name).toBe('Writer');
  });

  it('lists all agents', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Writer',
      role: 'writer',
      model: 'claude',
      provider: 'anthropic',
      capabilities: ['filesystem.read'],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    expect(registry.listAgents()).toHaveLength(1);
  });

  it('filters agents by role', () => {
    registry.registerAgent({
      id: 'writer-1',
      name: 'Writer',
      role: 'writer',
      model: 'claude',
      provider: 'anthropic',
      capabilities: [],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    registry.registerAgent({
      id: 'reviewer-1',
      name: 'Reviewer',
      role: 'reviewer',
      model: 'gpt',
      provider: 'openai',
      capabilities: [],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    expect(registry.getAgentsByRole('writer')).toContain('writer-1');
    expect(registry.getAgentsByRole('reviewer')).toContain('reviewer-1');
  });

  it('returns healthy agents', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Writer',
      role: 'writer',
      model: 'claude',
      provider: 'anthropic',
      capabilities: [],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    expect(registry.getHealthyAgents()).toContain('agent-1');
    registry.updateStatus('agent-1', 'failed');
    expect(registry.getHealthyAgents()).not.toContain('agent-1');
  });

  it('records outcomes', () => {
    registry.registerAgent({
      id: 'agent-1',
      name: 'Writer',
      role: 'writer',
      model: 'claude',
      provider: 'anthropic',
      capabilities: [],
      maxTokensPerTurn: 4096,
      costCapPerTask: 10,
      costCapPerSession: 20,
      costCapPerDay: 50,
      maxParallelInstances: 1,
      rateLimitRpm: 60,
    });
    registry.recordOutcome('agent-1', true);
    registry.recordOutcome('agent-1', false);
    const agent = registry.getAgent('agent-1');
    expect(agent?.totalRuns).toBe(2);
  });
});

describe('ModelSelector', () => {
  let selector: ModelSelector;

  beforeEach(() => {
    selector = new ModelSelector();
  });

  it('returns null for empty registry', () => {
    expect(selector.selectForRole('writer', {})).toBeNull();
  });

  it('returns empty list for empty registry', () => {
    expect(selector.getAvailableModels()).toEqual([]);
  });

  it('registers and retrieves models', () => {
    const registry = selector.getModelRegistry();
    registry.register({
      modelId: 'claude-sonnet',
      provider: 'anthropic',
      tier: 'frontier',
      contextWindow: 200000,
      modalities: ['text'],
      toolSupport: true,
      structuredOutput: true,
      streaming: true,
      reasoning: false,
      costPerMillionInput: 3,
      costPerMillionOutput: 15,
      specialties: [],
    });
    const models = selector.getAvailableModels();
    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe('claude-sonnet');
  });

  it('selects a model for a role', () => {
    const registry = selector.getModelRegistry();
    registry.register({
      modelId: 'claude-sonnet',
      provider: 'anthropic',
      tier: 'frontier',
      contextWindow: 200000,
      modalities: ['text'],
      toolSupport: true,
      structuredOutput: true,
      streaming: true,
      reasoning: false,
      costPerMillionInput: 3,
      costPerMillionOutput: 15,
      specialties: [],
    });
    const selected = selector.selectForRole('writer', { minTier: 'mid' });
    expect(selected).not.toBeNull();
    expect(selected?.modelId).toBe('claude-sonnet');
  });

  it('filters by tier', () => {
    const registry = selector.getModelRegistry();
    registry.register({
      modelId: 'gpt-4',
      provider: 'openai',
      tier: 'mid',
      contextWindow: 128000,
      modalities: ['text'],
      toolSupport: true,
      structuredOutput: true,
      streaming: true,
      reasoning: false,
      costPerMillionInput: 10,
      costPerMillionOutput: 30,
      specialties: [],
    });
    const selected = selector.selectForRole('reviewer', { minTier: 'frontier' });
    expect(selected).toBeNull();
  });

  it('returns health info', () => {
    const health = selector.getModelHealth('unknown');
    expect(health).toBeNull();
  });
});

describe('CheckpointManager', () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  it('creates checkpoints', () => {
    const id = manager.createCheckpoint('run-1', 'session-1', 'manual', {
      objective: 'Fix bug',
      currentPlan: 'Step 1',
      completedWork: ['file.ts'],
      filesChanged: ['file.ts'],
      commandsRun: ['npm test'],
      testResults: { passed: 5 },
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: ['verify fix'],
      relevantContext: ['src/file.ts'],
    });
    expect(id).toBeTruthy();
    expect(manager.getCheckpoint(id)).not.toBeNull();
  });

  it('gets the latest checkpoint for a run', () => {
    manager.createCheckpoint('run-1', 'session-1', 'manual', {
      objective: 'First',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    });
    const id2 = manager.createCheckpoint('run-1', 'session-1', 'manual', {
      objective: 'Second',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    });
    expect(manager.getLatestCheckpoint('run-1')?.id).toBe(id2);
  });

  it('lists checkpoints for a run', () => {
    manager.createCheckpoint('run-1', 'session-1', 'manual', {
      objective: 'A',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    });
    manager.createCheckpoint('run-1', 'session-1', 'auto', {
      objective: 'B',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    });
    expect(manager.listCheckpoints('run-1')).toHaveLength(2);
  });

  it('invalidates checkpoints', () => {
    const id = manager.createCheckpoint('run-1', 'session-1', 'manual', {
      objective: 'Test',
      currentPlan: '',
      completedWork: [],
      filesChanged: [],
      commandsRun: [],
      testResults: {},
      knownFailures: [],
      openQuestions: [],
      constraints: {},
      nextActions: [],
      relevantContext: [],
    });
    manager.invalidateCheckpoints('run-1');
    expect(manager.getCheckpoint(id)?.valid).toBe(false);
  });
});

describe('VerificationController', () => {
  let controller: VerificationController;

  beforeEach(() => {
    controller = new VerificationController();
  });

  it('verifies trio strategy', () => {
    expect(controller.shouldVerify('trio', {
      overall: 0.5,
      dimensions: {
        codeVolume: 0.5,
        architecturalDepth: 0.5,
        dependencyComplexity: 0.5,
        testCoverage: 0.5,
        securitySensitivity: 0.5,
        domainNovelty: 0.5,
        errorHandling: 0.5,
        concurrency: 0.5,
        externalIntegrations: 0.5,
        dataTransformation: 0.5,
        stateManagement: 0.5,
        algorithmicComplexity: 0.5,
        apiDesign: 0.5,
        refactoringScope: 0.5,
        crossCuttingConcerns: 0.5,
      },
    }, 'test')).toBe(true);
  });

  it('verifies high-complexity tasks', () => {
    expect(controller.shouldVerify('solo', {
      overall: 0.8,
      dimensions: {
        codeVolume: 0.5,
        architecturalDepth: 0.5,
        dependencyComplexity: 0.5,
        testCoverage: 0.5,
        securitySensitivity: 0.5,
        domainNovelty: 0.5,
        errorHandling: 0.5,
        concurrency: 0.5,
        externalIntegrations: 0.5,
        dataTransformation: 0.5,
        stateManagement: 0.5,
        algorithmicComplexity: 0.5,
        apiDesign: 0.5,
        refactoringScope: 0.5,
        crossCuttingConcerns: 0.5,
      },
    }, 'test')).toBe(true);
  });

  it('skips low-complexity solo tasks', () => {
    expect(controller.shouldVerify('solo', {
      overall: 0.3,
      dimensions: {
        codeVolume: 0.1,
        architecturalDepth: 0.1,
        dependencyComplexity: 0.1,
        testCoverage: 0.1,
        securitySensitivity: 0.1,
        domainNovelty: 0.1,
        errorHandling: 0.1,
        concurrency: 0.1,
        externalIntegrations: 0.1,
        dataTransformation: 0.1,
        stateManagement: 0.1,
        algorithmicComplexity: 0.1,
        apiDesign: 0.1,
        refactoringScope: 0.1,
        crossCuttingConcerns: 0.1,
      },
    }, 'test')).toBe(false);
  });
});

describe('ContextController', () => {
  let controller: ContextController;

  beforeEach(() => {
    controller = new ContextController({ workspaceRoot: process.cwd() });
  });

  it('returns empty context without an engine', async () => {
    const result = await controller.buildContextPack('test task');
    expect(result.content).toBe('');
    expect(result.files).toEqual([]);
  });

  it('registers agents', () => {
    expect(() => controller.registerAgent('agent-1', 200000)).not.toThrow();
  });

  it('tracks tokens', () => {
    controller.registerAgent('agent-1', 200000);
    const result = controller.trackTokens('agent-1', 1000, 500);
    expect(result.fillPercent).toBeGreaterThanOrEqual(0);
    expect(['none', 'compact', 'handoff', 'emergency_handoff']).toContain(result.recommendedAction);
  });

  it('masks observations', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'A'.repeat(5000) },
    ];
    const masked = controller.maskObservations(messages);
    expect(masked.length).toBe(2);
  });

  it('compacts messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'A'.repeat(5000) },
    ];
    const result = controller.compact(messages);
    expect(result.messages.length).toBe(2);
    expect(result.handoffDoc).toBeDefined();
  });

  it('creates a handoff', () => {
    const handoff = controller.createHandoff('agent-1', 'context_full');
    expect(handoff.state.objective).toBeDefined();
  });

  it('validates a handoff', () => {
    const handoff = controller.createHandoff('agent-1', 'context_full');
    const validation = controller.validateHandoff(handoff);
    expect(validation.valid).toBe(true);
  });
});
