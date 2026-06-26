import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoSkillService } from '../auto-skill-service.js';
import { SessionAnalyzer } from '../session-analyzer.js';
import { SkillSynthesizer } from '../skill-synthesizer.js';
import type { SessionPattern, DomainCluster } from '../types.js';
import { existsSync, rmSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

function tmpDir(): string {
  return path.join(os.tmpdir(), `chimera-autoskill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function makePattern(id: string): SessionPattern {
  return {
    sessionId: id,
    domain: { topic: 'testing', confidence: 0.8, keywords: ['test', 'vitest'], fileTypes: ['.ts'], hotPaths: ['src/'] },
    tools: { sequence: ['readFile', 'writeFile'], frequency: { readFile: 2, writeFile: 1 }, friction: [], categories: ['filesystem'] },
    quality: { status: 'done', reviewerVerdict: 'PASS', revisionCycles: 0, failures: [] },
    cost: { totalUsd: 0.05, perProvider: {}, efficiency: 'cheap' },
    agents: { count: 1, roles: ['writer'], handoffs: 0 },
    mode: 'code',
    task: 'test task',
  };
}

function makeCluster(patterns: SessionPattern[]): DomainCluster {
  return {
    topic: 'testing',
    sessions: patterns,
    keywords: ['test', 'vitest'],
    fileTypes: ['.ts'],
    hotPaths: ['src/'],
    successRate: 0.9,
  };
}

describe('AutoSkillService', () => {
  let dir: string;
  let analyzer: SessionAnalyzer;
  let synth: SkillSynthesizer;

  beforeEach(() => {
    dir = tmpDir();
    analyzer = new SessionAnalyzer();
    synth = new SkillSynthesizer();
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty result when too few checkpoints', async () => {
    const service = new AutoSkillService(analyzer, synth, { minPatternCount: 3 }, dir);
    const result = await service.detectAndSynthesize([{ events: [], messages: [] }]);
    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
  });

  it('creates skills from domain clusters', async () => {
    const patterns = [makePattern('s1'), makePattern('s2'), makePattern('s3')];
    const mockAnalyzer = {
      analyzeBatch: vi.fn().mockReturnValue({
        byDomain: new Map(),
        bySequence: new Map(),
        byOutcome: new Map(),
        domainClusters: [makeCluster(patterns)],
        repeatedSequences: [],
      }),
    } as unknown as SessionAnalyzer;

    const service = new AutoSkillService(mockAnalyzer, synth, { minPatternCount: 2, minConfidence: 0.5 }, dir);
    const result = await service.detectAndSynthesize([
      { events: [], messages: [] },
      { events: [], messages: [] },
      { events: [], messages: [] },
    ]);

    expect(result.created.length).toBeGreaterThanOrEqual(1);
    const skillsDir = path.join(dir, '.chimera', 'skills');
    expect(existsSync(skillsDir)).toBe(true);
    const files = readdirSync(skillsDir);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('detects repeated tool sequences and writes skill files', async () => {
    const mockAnalyzer = {
      analyzeBatch: vi.fn().mockReturnValue({
        byDomain: new Map(),
        bySequence: new Map(),
        byOutcome: new Map(),
        domainClusters: [],
        repeatedSequences: [
          {
            sequence: ['readFile', 'searchFiles', 'writeFile'],
            frequency: 5,
            successRate: 0.9,
            avgCost: 0.05,
            domainKeywords: ['testing'],
          },
        ],
      }),
    } as unknown as SessionAnalyzer;

    const service = new AutoSkillService(mockAnalyzer, synth, { minPatternCount: 3, minConfidence: 0.1 }, dir);
    const result = await service.detectAndSynthesize(Array.from({ length: 5 }, () => ({ events: [], messages: [] })));

    expect(result.created.length).toBeGreaterThanOrEqual(1);
    const skillsDir = path.join(dir, '.chimera', 'skills');
    const files = readdirSync(skillsDir);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('skips patterns below minPatternCount', async () => {
    const mockAnalyzer = {
      analyzeBatch: vi.fn().mockReturnValue({
        byDomain: new Map(),
        bySequence: new Map(),
        byOutcome: new Map(),
        domainClusters: [],
        repeatedSequences: [
          { sequence: ['readFile'], frequency: 1, successRate: 1.0, avgCost: 0.01, domainKeywords: [] },
        ],
      }),
    } as unknown as SessionAnalyzer;

    const service = new AutoSkillService(mockAnalyzer, synth, { minPatternCount: 3 }, dir);
    const result = await service.detectAndSynthesize([{ events: [], messages: [] }]);
    expect(result.created).toHaveLength(0);
  });
});
