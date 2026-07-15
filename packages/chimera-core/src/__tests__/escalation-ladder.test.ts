import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  AttemptTrail,
  findDeterministicSkill,
  shouldDelegateToSubagents,
  formatEscalationFailure,
  captureSkill,
  WorkflowObservation,
  detectWorkflowCandidate,
  decideDelegation,
  BudgetGuard,
  shouldAskOnBlock,
} from '../escalation-ladder.js';
import type { ComplexityScore } from '../types/router.js';

function makeWs(): string {
  const ws = mkdtempSync(path.join(tmpdir(), 'chimera-escal-'));
  return ws;
}

function lowComplexity(): ComplexityScore {
  return {
    overall: 0.2,
    dimensions: {
      codeVolume: 0, architecturalDepth: 0, dependencyComplexity: 0, testCoverage: 0,
      securitySensitivity: 0, domainNovelty: 0, errorHandling: 0, concurrency: 0,
      externalIntegrations: 0, dataTransformation: 0, stateManagement: 0,
      algorithmicComplexity: 0, apiDesign: 0, refactoringScope: 0, crossCuttingConcerns: 0,
    },
  };
}

describe('escalation-ladder', () => {
  it('records an ordered attempt trail and reports it on failure', () => {
    const trail = new AttemptTrail();
    trail.push('deterministic-skill', 'skipped', 'no match');
    trail.push('writer', 'attempt');
    trail.push('reviewer', 'failed', 'verdict FAIL');
    const report = formatEscalationFailure('fix the bug', trail, 'missing credential X');
    expect(report).toContain('fix the bug');
    expect(report).toContain('deterministic-skill');
    expect(report).toContain('reviewer');
    expect(report).toContain('missing credential X');
    expect(report.indexOf('deterministic-skill')).toBeLessThan(report.indexOf('reviewer'));
  });

  it('finds an exact-match skill and arms it', () => {
    const ws = makeWs();
    try {
      mkdirSync(path.join(ws, '.chimera', 'skills'), { recursive: true });
      writeFileSync(
        path.join(ws, '.chimera', 'skills', 'fix-typo.md'),
        '---\nname: fix-typo\ndescription: fix a typo in a file\n---\nStep 1 edit the file.\n',
      );
      const m = findDeterministicSkill('please fix typo in readme', ws);
      expect(m.skill?.name).toBe('fix-typo');
      expect(m.match).toBe('exact');
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns no match when skills dir is empty', () => {
    const ws = makeWs();
    try {
      const m = findDeterministicSkill('do a unique thing', ws);
      expect(m.skill).toBeNull();
      expect(m.match).toBeNull();
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('flags delegation for high-complexity tasks', () => {
    const c = lowComplexity();
    c.overall = 0.8;
    expect(shouldDelegateToSubagents('refactor the parser', c)).toBe(true);
    expect(shouldDelegateToSubagents('fix this typo', lowComplexity())).toBe(false);
  });

  it('captures a skill to .chimera/skills', () => {
    const ws = makeWs();
    try {
      const p = captureSkill({
        name: 'My Approach',
        description: 'how to do X',
        content: 'run the script, then verify.',
        workspaceRoot: ws,
      });
      expect(existsSync(p)).toBe(true);
      // Re-discoverable via the existing loader.
      const m = findDeterministicSkill('my approach for X', ws);
      expect(m.skill?.name).toBe('My Approach');
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('Step 5: detects a repeated skill sequence as a workflow candidate', () => {
    const mk = (seq: string[]) => {
      const o = new WorkflowObservation();
      seq.forEach((t) => o.record(t));
      return o;
    };
    const hist = [mk(['lint', 'test', 'build']), mk(['lint', 'test', 'build']), mk(['lint', 'test', 'build']), mk(['docs', 'format'])];
    const cand = detectWorkflowCandidate(hist);
    expect(cand).not.toBeNull();
    expect(cand!.definition.steps).toHaveLength(3);
    expect(cand!.definition.steps[0].config.skill).toBe('lint');
    expect(cand!.definition.tags).toContain('composed');
    // A 2-repeat sequence must NOT qualify (below minRepeats).
    const weak = detectWorkflowCandidate([mk(['a', 'b', 'c']), mk(['a', 'b', 'c'])]);
    expect(weak).toBeNull();
  });

  it('Step 6: delegates long/separate-context and parallel subtasks, not trivial ones', () => {
    const high = lowComplexity();
    high.overall = 0.8;
    const low = lowComplexity();

    expect(
      decideDelegation('do deep research on the API surface', high, {}).delegate,
    ).toBe(true);
    expect(
      decideDelegation('refactor across multiple files in parallel', high, { hasSubtasks: true, independent: true }).delegate,
    ).toBe(true);
    expect(
      decideDelegation('bump the version in package.json', low, {}).delegate,
    ).toBe(false);
    expect(
      decideDelegation('use a different cloud credential scope', low, { needsDifferentScope: true }).delegate,
    ).toBe(true);
  });

  it('Step 7: budget guard caps per-rung attempts, total rungs, and time', () => {
    const g = new BudgetGuard({ maxAttemptsPerRung: 2, maxRunways: 3, timeBudgetMs: 10_000_000 });
    expect(g.tryRung('writer').ok).toBe(true);
    expect(g.tryRung('writer').ok).toBe(true);
    expect(g.tryRung('writer').ok).toBe(false); // over per-rung cap
    expect(g.report()).toContain('writer: 3 attempt(s)');
  });

  it('Step 7: ask only after ladder exhausted AND blocker is missing info', () => {
    expect(shouldAskOnBlock('missing api key', false).ask).toBe(false);
    expect(shouldAskOnBlock('missing api key', true).ask).toBe(true);
    expect(shouldAskOnBlock('tool crashed', true).ask).toBe(false);
  });
});

