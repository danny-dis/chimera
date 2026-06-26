/**
 * End-to-end flow tests for all 6 deliberation presets.
 *
 * Each test sends a prompt through the DeliberationEngine and verifies
 * the full lifecycle: prompt → executor → result display shape.
 *
 * Tests use mock providers that match on message content keywords,
 * simulating the real prompt formats each executor sends.
 */

import { describe, it, expect, vi } from 'vitest';
import { DeliberationEngine, presets } from '../engine.js';
import { ModelRegistry } from '../../../../../chimera-providers/src/model-registry.js';
import { CostTracker } from '../../../cost-tracker.js';
import { EventStream } from '../../../event-stream.js';
import type { LLMProvider } from '../../../session-orchestrator.js';
import type { ModelEntry } from '../../../../../chimera-providers/src/model-registry.js';

// ── Shared test infrastructure ────────────────────────────────────────

const IDS = {
  solo: 'flow/solo',
  duoA: 'flow/duo-a',
  duoB: 'flow/duo-b',
  trioWriter: 'flow/trio-writer',
  trioReviewer: 'flow/trio-reviewer',
  trioChallenger: 'flow/trio-challenger',
  fusionPanel1: 'flow/fusion-panel-1',
  fusionPanel2: 'flow/fusion-panel2',
  fusionJudge: 'flow/fusion-judge',
  hive: 'flow/hive',
} as const;

function mockProvider(
  responses: Array<{ match: string | RegExp; content: string }>,
): LLMProvider {
  const calls: Array<{ role: string; content: string }>[] = [];
  const provider = {
    complete: vi.fn().mockImplementation(
      async (messages: Array<{ role: string; content: string }>) => {
        calls.push(messages);
        const all = messages.map((m) => m.content).join('\n');
        for (const r of responses) {
          const hit =
            typeof r.match === 'string'
              ? all.includes(r.match)
              : r.match.test(all);
          if (hit) {
            return {
              content: r.content,
              usage: { inputTokens: 120, outputTokens: 80 },
            };
          }
        }
        return {
          content: 'fallback-response',
          usage: { inputTokens: 50, outputTokens: 10 },
        };
      },
    ),
    getCalls: () => calls,
  };
  return provider as unknown as LLMProvider;
}

function registry(): ModelRegistry {
  const reg = new ModelRegistry();
  const internal = reg as unknown as { models: Map<string, ModelEntry> };
  const base: ModelEntry = {
    id: 'x',
    name: 'mock',
    provider: 'mock',
    contextWindow: 8192,
    maxOutputTokens: 1024,
    pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    capabilities: {
      toolCalling: false,
      structuredOutput: true,
      vision: false,
      reasoning: false,
      parallelToolCalls: false,
    },
    degradationThreshold: 0.5,
    tier: 'cheap',
  };
  for (const id of Object.values(IDS)) {
    if (!internal.models.has(id)) {
      internal.models.set(id, { ...base, id, name: id });
    }
  }
  return reg;
}

function factory(
  map: Record<string, LLMProvider>,
): (modelId: string) => LLMProvider {
  return (id) => {
    const p = map[id];
    if (!p) throw new Error(`no mock for ${id}`);
    return p;
  };
}

// ── SOLO preset flow ──────────────────────────────────────────────────

describe('Flow: solo preset', () => {
  it('auto CoT: high complexity → thinker + writer + reviewer (3 calls)', async () => {
    const provider = mockProvider([
      { match: /strategic thinker/, content: 'Thinking: complex refactor needed' },
      { match: /You are the writer/, content: 'Draft: refactored module' },
      { match: /You are the reviewer/, content: 'Reviewed: looks good' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      costTracker: new CostTracker(new EventStream()),
      taskRouter: { classifyTask: async () => ({ overall: 0.7, dimensions: {} }) } as any,
      providerFactory: factory({ [IDS.solo]: provider }),
    });

    const result = await engine.run(presets.solo(IDS.solo, 'Refactor the auth module'));

    expect(result.mode).toBe('solo');
    expect(result.output).toBe('Reviewed: looks good');
    expect(provider.getCalls().length).toBe(3);
  });

  it('auto CoT: low complexity → writer + reviewer only (2 calls)', async () => {
    const provider = mockProvider([
      { match: /You are the writer/, content: 'Fixed the typo' },
      { match: /You are the reviewer/, content: 'Reviewed: looks correct' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      costTracker: new CostTracker(new EventStream()),
      taskRouter: { classifyTask: async () => ({ overall: 0.1, dimensions: {} }) } as any,
      providerFactory: factory({ [IDS.solo]: provider }),
    });

    const result = await engine.run(presets.solo(IDS.solo, 'Fix typo'));

    expect(result.mode).toBe('solo');
    expect(result.output).toBe('Reviewed: looks correct');
    // No thinker — only writer + reviewer
    expect(provider.getCalls().length).toBe(2);
  });

  it('explicit eternalCoT: true → always thinker (3 calls)', async () => {
    const provider = mockProvider([
      { match: /strategic thinker/, content: 'Thinking...' },
      { match: /You are the writer/, content: 'Answer' },
      { match: /You are the reviewer/, content: 'Reviewed' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      taskRouter: { classifyTask: async () => ({ overall: 0.1, dimensions: {} }) } as any,
      providerFactory: factory({ [IDS.solo]: provider }),
    });

    // Low complexity, but eternalCoT forced on
    const result = await engine.run({
      mode: 'solo', model: IDS.solo, task: 'Fix typo', eternalCoT: true,
    });

    expect(result.mode).toBe('solo');
    expect(provider.getCalls().length).toBe(3);
  });

  it('explicit eternalCoT: false → never thinker (2 calls)', async () => {
    const provider = mockProvider([
      { match: /You are the writer/, content: 'Answer' },
      { match: /You are the reviewer/, content: 'Reviewed' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      taskRouter: { classifyTask: async () => ({ overall: 0.9, dimensions: {} }) } as any,
      providerFactory: factory({ [IDS.solo]: provider }),
    });

    // High complexity, but eternalCoT forced off
    const result = await engine.run({
      mode: 'solo', model: IDS.solo, task: 'Complex task', eternalCoT: false,
    });

    expect(result.mode).toBe('solo');
    expect(provider.getCalls().length).toBe(2);
  });

  it('no TaskRouter → defaults to CoT on (safe fallback)', async () => {
    const provider = mockProvider([
      { match: /strategic thinker/, content: 'Thinking...' },
      { match: /You are the writer/, content: 'Answer' },
      { match: /You are the reviewer/, content: 'Reviewed' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      // No taskRouter injected
      providerFactory: factory({ [IDS.solo]: provider }),
    });

    const result = await engine.run(presets.solo(IDS.solo, 'Some task'));

    expect(result.mode).toBe('solo');
    // No router → fallback complexity 0.5 → CoT enabled
    expect(provider.getCalls().length).toBe(3);
  });
});

// ── DUO preset flow ───────────────────────────────────────────────────

describe('Flow: duo preset', () => {
  it('prompt → modelA (writer) → modelB (reviewer) → final result', async () => {
    const providerA = mockProvider([
      { match: /You are the writer/, content: 'A says: the answer is blue' },
    ]);
    const providerB = mockProvider([
      { match: /You are the reviewer/, content: 'B says: the answer is blue (verified)' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      providerFactory: factory({ [IDS.duoA]: providerA, [IDS.duoB]: providerB }),
    });

    const result = await engine.run(
      presets.duo(IDS.duoA, IDS.duoB, 'What color is the sky?'),
    );

    expect(result.mode).toBe('duo');
    expect(result.output).toBe('B says: the answer is blue (verified)');
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);

    // Two LLM calls: writer then reviewer
    expect(providerA.getCalls().length).toBe(1);
    expect(providerB.getCalls().length).toBe(1);

    // Reviewer output is the final response
    expect(result.analysis.finalResponse).toBe(result.output);
  });
});

// ── TRIO preset flow ──────────────────────────────────────────────────

describe('Flow: trio preset', () => {
  it('prompt → writer → reviewer → challenger → synthesize → final', async () => {
    const writer = mockProvider([
      { match: /You are the writer/, content: 'TRIO DRAFT: use a hash map' },
    ]);
    const reviewer = mockProvider([
      {
        match: /You are the reviewer/,
        content: JSON.stringify({
          verdict: 'pass',
          issues: [],
          commentary: 'Good approach, O(n) lookup',
        }),
      },
    ]);
    const challenger = mockProvider([
      {
        match: /You are the challenger/,
        content: JSON.stringify({
          challenges: ['What about collisions?'],
          alternatives: ['Use a balanced BST'],
        }),
      },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      providerFactory: factory({
        [IDS.trioWriter]: writer,
        [IDS.trioReviewer]: reviewer,
        [IDS.trioChallenger]: challenger,
      }),
    });

    const result = await engine.run(
      presets.trio(
        IDS.trioWriter,
        IDS.trioReviewer,
        'How to implement a lookup table?',
        IDS.trioChallenger,
      ),
    );

    expect(result.mode).toBe('trio');
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);

    // Three LLM calls: writer + reviewer + challenger
    expect(writer.getCalls().length).toBe(1);
    expect(reviewer.getCalls().length).toBe(1);
    expect(challenger.getCalls().length).toBe(1);

    // Result has all analysis fields
    expect(result.analysis.consensus).toEqual(expect.any(Array));
    expect(result.analysis.conflicts).toEqual(expect.any(Array));
  });
});

// ── FUSION preset flow ────────────────────────────────────────────────

describe('Flow: fusion preset', () => {
  it('prompt → parallel panel (2 models) → judge → final result', async () => {
    const panel1 = mockProvider([
      { match: /./, content: 'Panel 1: security-focused analysis' },
    ]);
    const panel2 = mockProvider([
      { match: /./, content: 'Panel 2: performance-focused analysis' },
    ]);
    const judge = mockProvider([
      {
        match: /You are the judge/,
        content: JSON.stringify({
          thought: 'Both panels provided valid perspectives',
          finalResponse: 'Synthesized: balanced security+performance approach',
          consensus: ['Both agree on core algorithm'],
          conflicts: ['Differ on optimization strategy'],
          uniqueInsights: ['Panel 1 found timing attack', 'Panel 2 found cache miss'],
          blindSpots: ['Neither covered mobile'],
          confidence: 0.82,
        }),
      },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      costTracker: new CostTracker(new EventStream()),
      providerFactory: factory({
        [IDS.fusionPanel1]: panel1,
        [IDS.fusionPanel2]: panel2,
        [IDS.fusionJudge]: judge,
      }),
    });

    const result = await engine.run(
      presets.fusion(
        [IDS.fusionPanel1, IDS.fusionPanel2],
        IDS.fusionJudge,
        'Evaluate this caching strategy',
      ),
    );

    expect(result.mode).toBe('fusion');
    expect(result.output).toBe('Synthesized: balanced security+performance approach');
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);

    // Two parallel panel calls + one judge call = 3 total
    expect(panel1.getCalls().length).toBe(1);
    expect(panel2.getCalls().length).toBe(1);
    expect(judge.getCalls().length).toBe(1);

    // Judge output populates analysis
    expect(result.analysis.thought).toBe('Both panels provided valid perspectives');
    expect(result.analysis.consensus).toEqual(['Both agree on core algorithm']);
    expect(result.analysis.conflicts).toEqual(['Differ on optimization strategy']);
    expect(result.analysis.uniqueInsights).toEqual([
      'Panel 1 found timing attack',
      'Panel 2 found cache miss',
    ]);
    expect(result.analysis.blindSpots).toEqual(['Neither covered mobile']);
    expect(result.analysis.confidence).toBe(0.82);
  });
});

// ── HIVE preset flow ──────────────────────────────────────────────────

describe('Flow: hive preset', () => {
  it('prompt → decompose → parallel subtasks → merge → final result', async () => {
    const provider = mockProvider([
      // Stage 1: Decomposition
      {
        match: /STRATEGIC DECOMPOSITION/,
        content: JSON.stringify({
          subTasks: [
            { id: 'auth', description: 'Implement authentication', dependencies: [], estimatedTokens: 500 },
            { id: 'api', description: 'Build REST API', dependencies: ['auth'], estimatedTokens: 500 },
            { id: 'ui', description: 'Create dashboard UI', dependencies: ['api'], estimatedTokens: 500 },
          ],
          strategy: 'mixed',
          rationale: 'Three independent modules with auth dependency chain',
        }),
      },
      // Stage 2: Subtask execution (called 3 times)
      { match: /CORE SUB-AGENT DIRECTIVE/, content: 'Subtask output' },
      // Stage 3: Merge
      {
        match: /RESULT SYNTHESIS/,
        content: JSON.stringify({
          mergedOutput: 'Full stack app: auth + API + dashboard complete',
          conflicts: [],
          resolved: true,
        }),
      },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      costTracker: new CostTracker(new EventStream()),
      providerFactory: factory({ [IDS.hive]: provider }),
    });

    const result = await engine.run(
      presets.hive([IDS.hive], 'Build a full stack app with auth, API, and dashboard'),
    );

    expect(result.mode).toBe('hive');
    expect(result.output).toBe('Full stack app: auth + API + dashboard complete');
    expect(result.degraded).toBe(false);
    expect(result.totalTokens).toBeGreaterThan(0);

    // Thought contains decomposition info
    expect(result.analysis.thought).toContain('Decomposed into 3 subtasks');

    // Analysis fields populated
    expect(result.analysis.finalResponse).toBe(result.output);
    expect(result.analysis.consensus).toEqual(expect.any(Array));
    expect(result.analysis.conflicts).toEqual(expect.any(Array));
  });

  it('respects maxSubTasks limit', async () => {
    const provider = mockProvider([
      {
        match: /STRATEGIC DECOMPOSITION/,
        content: JSON.stringify({
          subTasks: [
            { id: 'a', description: 'task a', dependencies: [], estimatedTokens: 100 },
            { id: 'b', description: 'task b', dependencies: [], estimatedTokens: 100 },
            { id: 'c', description: 'task c', dependencies: [], estimatedTokens: 100 },
            { id: 'd', description: 'task d', dependencies: [], estimatedTokens: 100 },
          ],
          strategy: 'parallel',
          rationale: 'four tasks',
        }),
      },
      { match: /CORE SUB-AGENT DIRECTIVE/, content: 'result' },
      {
        match: /RESULT SYNTHESIS/,
        content: JSON.stringify({ mergedOutput: 'merged', conflicts: [], resolved: true }),
      },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      providerFactory: factory({ [IDS.hive]: provider }),
    });

    const result = await engine.run({
      mode: 'hive',
      models: [IDS.hive],
      task: 'Do 4 things',
      maxSubTasks: 2,
    });

    expect(result.mode).toBe('hive');
    // Only 2 subtasks executed (capped by maxSubTasks)
    expect(result.analysis.thought).toContain('2 subtasks');
  });
});

// ── AUTO preset flow ──────────────────────────────────────────────────

describe('Flow: auto preset', () => {
  it('low complexity → auto-selects solo → prompt flows through solo', async () => {
    const provider = mockProvider([
      // Thinker
      { match: /strategic thinker/, content: 'Thinking: simple fix' },
      // Solo: writer
      { match: /You are the writer/, content: 'Fixed the typo' },
      // Solo: reviewer
      { match: /You are the reviewer/, content: 'Reviewed: typo fixed correctly' },
    ]);

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      costTracker: new CostTracker(new EventStream()),
      availableProviders: ['provider-a'],
      providerFactory: factory({ default: provider }),
    });

    const result = await engine.run(presets.auto('fix typo in README'));

    expect(result.mode).toBe('auto');
    expect(result.autoSelection).toBeDefined();
    expect(result.autoSelection?.selectedPreset).toBe('solo');
    expect(result.output).toBe('Reviewed: typo fixed correctly');
    expect(result.totalTokens).toBeGreaterThan(0);

    // Event emitted for observability
    const events = new EventStream();
    // (events are in the engine's eventStream, not a new one)
  });

  it('high complexity with 2+ providers → auto-selects trio', async () => {
    const writer = mockProvider([
      { match: /You are the writer/, content: 'Trio draft' },
    ]);
    const reviewer = mockProvider([
      {
        match: /You are the reviewer/,
        content: JSON.stringify({ verdict: 'pass', issues: [], commentary: 'ok' }),
      },
    ]);
    const challenger = mockProvider([
      {
        match: /You are the challenger/,
        content: JSON.stringify({ challenges: [], alternatives: [] }),
      },
    ]);

    // Mock TaskRouter to return high complexity
    const mockTaskRouter = {
      classifyTask: async () => ({
        overall: 0.85,
        dimensions: {
          codeVolume: 0.8, architecturalDepth: 0.9, dependencyComplexity: 0.7,
          testCoverage: 0.5, securitySensitivity: 0.6, domainNovelty: 0.7,
          errorHandling: 0.5, concurrency: 0.4, externalIntegrations: 0.6,
          dataTransformation: 0.5, stateManagement: 0.5, algorithmicComplexity: 0.7,
          apiDesign: 0.6, refactoringScope: 0.8, crossCuttingConcerns: 0.7,
        },
      }),
    };

    const engine = new DeliberationEngine({
      eventStream: new EventStream(),
      registry: registry(),
      availableProviders: ['provider-a', 'provider-b'],
      taskRouter: mockTaskRouter as any,
      providerFactory: factory({
        [IDS.trioWriter]: writer,
        [IDS.trioReviewer]: reviewer,
        [IDS.trioChallenger]: challenger,
        default: writer,
      }),
    });

    const result = await engine.run(
      presets.auto('redesign the entire authentication system with OAuth2, SAML, and MFA support'),
    );

    expect(result.mode).toBe('auto');
    expect(result.autoSelection?.selectedPreset).toBe('trio');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('emits auto_preset_selected event with full metadata', async () => {
    const eventStream = new EventStream();
    const provider = mockProvider([
      { match: /You are the writer/, content: 'answer' },
      { match: /You are the reviewer/, content: 'reviewed answer' },
    ]);

    const engine = new DeliberationEngine({
      eventStream,
      registry: registry(),
      availableProviders: ['a'],
      providerFactory: factory({ default: provider }),
    });

    await engine.run(presets.auto('write a function'));

    const events = eventStream.getAll();
    const autoEvent = events.find((e) => e.type === 'auto_preset_selected');
    expect(autoEvent).toBeDefined();
    expect(autoEvent).toHaveProperty('selectedPreset');
    expect(autoEvent).toHaveProperty('complexity');
    expect(autoEvent).toHaveProperty('taskType');
    expect(autoEvent).toHaveProperty('task');
    expect(autoEvent).toHaveProperty('timestamp');
  });
});
