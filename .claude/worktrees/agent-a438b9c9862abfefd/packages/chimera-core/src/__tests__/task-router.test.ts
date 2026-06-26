import { describe, it, expect, vi } from 'vitest';
import { TaskRouter } from '../task-router.js';
import { EventStream } from '../event-stream.js';
import type { AgentConfig } from '../types/agent.js';

function makeProvider(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: overrides.id ?? 'p1',
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

describe('TaskRouter', () => {
  describe('classifyTask', () => {
    it('returns a ComplexityScore with overall and dimensions', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.classifyTask('implement a simple fix');

      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('dimensions');
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('classifies high-complexity tasks with higher scores', () => {
      const router = new TaskRouter(new EventStream());
      const high = router.classifyTask('implement distributed concurrent microservice architecture with database migration');
      const low = router.classifyTask('fix typo in comment');

      expect(high.overall).toBeGreaterThan(low.overall);
    });

    it('emits task_classified event', () => {
      const eventStream = new EventStream();
      const router = new TaskRouter(eventStream);
      router.classifyTask('build a REST API');

      const events = eventStream.getByType('task_classified');
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty('complexity');
      expect(events[0]).toHaveProperty('estimatedCost');
    });

    it('detects concurrency keywords', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.classifyTask('handle concurrent async parallel race condition');
      expect(result.dimensions.concurrency).toBeGreaterThan(0.3);
    });

    it('detects security keywords', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.classifyTask('add auth security token password validation');
      expect(result.dimensions.securitySensitivity).toBeGreaterThan(0.3);
    });
  });

  describe('selectProvider', () => {
    it('returns a provider matching the requested role', () => {
      const router = new TaskRouter(new EventStream());
      router.setProviders([
        makeProvider({ id: 'w1', role: 'writer', model: 'gpt-4o' }),
        makeProvider({ id: 'r1', role: 'reviewer', model: 'claude-haiku' }),
      ]);

      const writer = router.selectProvider({ overall: 0.5, dimensions: {} as any }, 'writer');
      expect(writer?.id).toBe('w1');
    });

    it('returns null if no provider matches', () => {
      const router = new TaskRouter(new EventStream());
      router.setProviders([
        makeProvider({ id: 'w1', role: 'writer' }),
      ]);

      const reviewer = router.selectProvider({ overall: 0.5, dimensions: {} as any }, 'reviewer');
      expect(reviewer).toBeNull();
    });

    it('sorts writers by model tier', () => {
      const router = new TaskRouter(new EventStream());
      router.setProviders([
        makeProvider({ id: 'expensive', role: 'writer', model: 'claude-opus' }),
        makeProvider({ id: 'cheap', role: 'writer', model: 'deepseek-chat' }),
      ]);

      const writer = router.selectProvider({ overall: 0.5, dimensions: {} as any }, 'writer');
      expect(writer?.id).toBe('cheap');
    });
  });

  describe('decomposeTask', () => {
    it('decomposes comma-separated tasks', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.decomposeTask('fix auth, then add tests, and update docs');

      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks).toContain('fix auth');
      expect(result.subtasks).toContain('add tests');
      expect(result.subtasks).toContain('update docs');
    });

    it('creates linear DAG for sequential tasks', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.decomposeTask('step one, step two, step three');

      expect(result.dag.size).toBe(2);
      expect(result.dag.get('step two')).toEqual(['step one']);
      expect(result.dag.get('step three')).toEqual(['step two']);
    });

    it('returns original task if no decomposition possible', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.decomposeTask('do everything');

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks[0]).toBe('do everything');
      expect(result.dag.size).toBe(0);
    });

    it('emits task_decomposed event', () => {
      const eventStream = new EventStream();
      const router = new TaskRouter(eventStream);
      router.decomposeTask('fix bug, add test');

      const events = eventStream.getByType('task_decomposed');
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty('subtasks');
      expect(events[0]).toHaveProperty('dependencyGraph');
    });

    it('handles semicolons as separators', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.decomposeTask('fix bug; add test; deploy');

      expect(result.subtasks).toHaveLength(3);
    });

    it('strips leading conjunctions from subtasks', () => {
      const router = new TaskRouter(new EventStream());
      const result = router.decomposeTask('fix bug, then add test, also deploy');

      expect(result.subtasks).toContain('add test');
      expect(result.subtasks).toContain('deploy');
    });
  });
});
