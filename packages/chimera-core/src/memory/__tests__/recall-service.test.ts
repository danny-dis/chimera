import { describe, it, expect, beforeEach } from 'vitest';
import { RecallService } from '../recall-service.js';
import { LongTermMemory } from '../long-term-memory.js';

describe('RecallService', () => {
  let memory: LongTermMemory;
  let service: RecallService;

  beforeEach(async () => {
    memory = new LongTermMemory();
    service = new RecallService(memory, { maxMemories: 3, maxTokens: 500, minScore: 0.01 });

    await memory.write({ content: 'TypeScript is preferred', topic: 'user', importance: 0.9, tags: ['lang'] });
    await memory.write({ content: 'Project uses pnpm workspaces', topic: 'project', importance: 0.7, tags: ['tooling'] });
    await memory.write({ content: 'Always run lint before commit', topic: 'feedback', importance: 0.6, tags: ['workflow'] });
  });

  it('returns formatted memory context', async () => {
    const result = await service.recall({ query: 'TypeScript project' });
    expect(result).toContain('[user]');
    expect(result).toContain('TypeScript is preferred');
  });

  it('respects maxMemories limit', async () => {
    const result = await service.recall({ query: 'project tooling language workflow' });
    const lines = result.split('\n').filter((l) => l.startsWith('-'));
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('returns empty string when no memories match', async () => {
    const empty = new LongTermMemory();
    const svc = new RecallService(empty);
    const result = await svc.recall({ query: 'quantum physics' });
    expect(result).toBe('');
  });

  it('boosts recently accessed memories', async () => {
    const result = await service.recall({ query: 'TypeScript' });
    expect(result).toContain('score:');
  });

  it('filters by minScore', async () => {
    const strict = new RecallService(memory, { minScore: 0.99 });
    const result = await strict.recall({ query: 'unrelated query xyz' });
    expect(result).toBe('');
  });

  it('truncates to token budget', async () => {
    const budgeted = new RecallService(memory, { maxTokens: 20, maxMemories: 10 });
    const result = await budgeted.recall({ query: 'TypeScript project workflow' });
    const tokens = Math.ceil(result.length / 4);
    expect(tokens).toBeLessThanOrEqual(25);
  });
});
