import { describe, it, expect } from 'vitest';
import { SubAgentSpawner } from '../sub-agent-spawner.js';
import { EventStream } from '../../event-stream.js';
import type { LLMProvider } from '../../session-orchestrator.js';
import type { SubTask } from '../types.js';

// Each subagent is its OWN provider instance -> proves distinct agents launch,
// not the same one reused. Output is tagged with the task id + calls are
// captured so we can assert per-task context isolation and real concurrency.
// Shared counter proves subagents overlap in time (not sequential).
// Task sleep (200ms) > spawner's launch stagger (100ms) so alpha is still
// active when beta launches -> overlap is guaranteed, not timing-lucky.
function makeProvider(taskId: string, seen: Array<{ msgs: unknown[] }>, shared: { active: number; peak: number }) {
  const provider: LLMProvider = {
    async complete(messages: any[]) {
      shared.active++;
      shared.peak = Math.max(shared.peak, shared.active);
      await new Promise((r) => setTimeout(r, 200));
      shared.active--;
      seen.push({ msgs: messages });
      return {
        content: `RESULT(${taskId})`,
        usage: { inputTokens: 10, outputTokens: 10 },
      };
    },
  };
  return provider;
}

describe('SubAgentSpawner — subagents actually launch', () => {
  it('spawns distinct subagents, isolates their context, runs them concurrently', async () => {
    const eventStream = new EventStream();
    const captured: Record<string, Array<{ msgs: unknown[] }>> = {};
    const shared = { active: 0, peak: 0 };

    const mk = (id: string) => {
      captured[id] = [];
      return makeProvider(id, captured[id], shared);
    };

    const tasks: SubTask[] = [
      { id: 'alpha', description: 'Task alpha', dependencies: [], context: 'CTX-alpha', provider: mk('alpha'), estimatedTokens: 100 },
      { id: 'beta', description: 'Task beta', dependencies: [], context: 'CTX-beta', provider: mk('beta'), estimatedTokens: 100 },
      { id: 'gamma', description: 'Task gamma', dependencies: ['alpha'], context: 'CTX-gamma', provider: mk('gamma'), estimatedTokens: 100 },
    ];

    const spawner = new SubAgentSpawner(eventStream, { maxConcurrency: 4 });
    const results = await spawner.executeAll(tasks);

    // 1. Every subagent returned success with its own tagged output.
    expect(results).toHaveLength(3);
    for (const id of ['alpha', 'beta', 'gamma']) {
      const r = results.find((x) => x.subTaskId === id)!;
      expect(r.status).toBe('success');
      expect(r.output).toBe(`RESULT(${id})`);
      // each provider was actually invoked exactly once (a real launch happened)
      expect(captured[id]).toHaveLength(1);
    }

    // 2. Context isolation: alpha's subagent only saw CTX-alpha, never beta/gamma.
    const alphaUser = (captured.alpha[0].msgs[1] as any).content as string;
    expect(alphaUser).toContain('CTX-alpha');
    expect(alphaUser).not.toContain('CTX-beta');
    expect(alphaUser).not.toContain('CTX-gamma');

    // 3. Subagent directive present (proves a delegated specialist, not raw chat).
    const alphaSys = (captured.alpha[0].msgs[0] as any).content as string;
    expect(alphaSys).toContain('CORE SUB-AGENT DIRECTIVE');

    // 4. Concurrency: alpha + beta overlapped (gamma waits on alpha). Peak >= 2.
    expect(shared.peak).toBeGreaterThanOrEqual(2);
  });
});
