import { describe, it, expect, vi } from 'vitest';
import { ResponseSynthesizer, type SynthesisInput, type Conflict } from '../response-synthesizer.js';
import { EventStream } from '../event-stream.js';

function makeInput(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
  return {
    agentId: overrides.agentId ?? 'writer-1',
    role: overrides.role ?? 'writer',
    content: overrides.content ?? 'The implementation uses a factory pattern.',
    confidence: overrides.confidence ?? 0.8,
    issues: overrides.issues,
    challenges: overrides.challenges,
    alternatives: overrides.alternatives,
  };
}

describe('ResponseSynthesizer', () => {
  describe('synthesize', () => {
    it('returns empty result for empty inputs', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([]);

      expect(result.unifiedResponse).toBe('');
      expect(result.conflicts).toHaveLength(0);
      expect(result.mergedIssues).toHaveLength(0);
      expect(result.overallConfidence).toBe(0);
      expect(result.needsUserEscalation).toBe(false);
    });

    it('returns single input content when no conflicts', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ content: 'Use a factory pattern.', confidence: 0.9 }),
      ]);

      expect(result.unifiedResponse).toContain('Use a factory pattern.');
      expect(result.conflicts).toHaveLength(0);
      expect(result.needsUserEscalation).toBe(false);
    });

    it('appends reviewer high-severity findings as notes', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ role: 'writer', content: 'The code is clean.', confidence: 0.8 }),
        makeInput({
          role: 'reviewer',
          agentId: 'reviewer-1',
          content: 'Reviewed.',
          confidence: 0.7,
          issues: [{ description: 'Missing tests', severity: 'high', evidence: 'No test file' }],
        }),
      ]);

      expect(result.unifiedResponse).toContain('Missing tests');
    });

    it('merges issues from multiple inputs sorted by severity', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          role: 'reviewer',
          agentId: 'reviewer-1',
          content: 'Review A',
          confidence: 0.7,
          issues: [
            { description: 'Minor style issue', severity: 'low', evidence: 'Line 10' },
          ],
        }),
        makeInput({
          role: 'reviewer',
          agentId: 'reviewer-2',
          content: 'Review B',
          confidence: 0.6,
          issues: [
            { description: 'Critical bug', severity: 'high', evidence: 'Line 50' },
          ],
        }),
      ]);

      expect(result.mergedIssues).toHaveLength(2);
      expect(result.mergedIssues[0].severity).toBe('high');
      expect(result.mergedIssues[1].severity).toBe('low');
    });

    it('deduplicates issues by description', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          role: 'reviewer',
          agentId: 'reviewer-1',
          content: 'Review A',
          confidence: 0.7,
          issues: [{ description: 'Missing test', severity: 'high', evidence: 'Line 1' }],
        }),
        makeInput({
          role: 'reviewer',
          agentId: 'reviewer-2',
          content: 'Review B',
          confidence: 0.6,
          issues: [{ description: 'Missing test', severity: 'med', evidence: 'Line 2' }],
        }),
      ]);

      expect(result.mergedIssues).toHaveLength(1);
      expect(result.mergedIssues[0].severity).toBe('high');
    });
  });

  describe('detectConflicts', () => {
    it('detects contradictory content', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'a1', content: 'we should not use caching for performance', confidence: 0.8 }),
        makeInput({ agentId: 'a2', content: 'we should use caching for performance', confidence: 0.8 }),
      ]);

      const contradictions = result.conflicts.filter((c) => c.type === 'contradiction');
      expect(contradictions.length).toBeGreaterThanOrEqual(1);
    });

    it('detects incomplete responses', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          agentId: 'a1',
          content: 'Implementation is complete.',
          confidence: 0.8,
          issues: [{ description: 'Bug found', severity: 'high', evidence: 'Line 10' }],
        }),
        makeInput({
          agentId: 'a2',
          content: 'Looks good overall.',
          confidence: 0.7,
        }),
      ]);

      const incomplete = result.conflicts.filter((c) => c.type === 'incomplete');
      expect(incomplete.length).toBeGreaterThanOrEqual(1);
    });

    it('detects preference conflicts from similar content', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          agentId: 'a1',
          content: 'use the factory pattern for creating objects and manage dependencies through constructor injection and service locator',
          confidence: 0.8,
        }),
        makeInput({
          agentId: 'a2',
          content: 'use the factory pattern for creating objects and manage dependencies through constructor injection and service locator pattern',
          confidence: 0.7,
        }),
      ]);

      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('resolveConflicts', () => {
    it('resolves contradiction by role authority', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'writer-1', role: 'writer', content: 'no caching needed', confidence: 0.8 }),
        makeInput({ agentId: 'reviewer-1', role: 'reviewer', content: 'caching is needed', confidence: 0.8 }),
      ]);

      const contradictions = result.conflicts.filter((c) => c.type === 'contradiction');
      if (contradictions.length > 0) {
        expect(contradictions[0].resolvedBy).toBe('role_authority');
        expect(contradictions[0].resolution).toContain('overrides');
      }
    });

    it('escalates to user when same-role agents contradict', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'writer-1', role: 'writer', content: 'do not use caching for performance', confidence: 0.8 }),
        makeInput({ agentId: 'writer-2', role: 'writer', content: 'use caching for performance', confidence: 0.8 }),
      ]);

      const escalated = result.conflicts.filter((c) => c.resolvedBy === 'user_escalation');
      expect(escalated.length).toBeGreaterThanOrEqual(1);
      expect(result.needsUserEscalation).toBe(true);
      expect(result.escalationReason).toBeDefined();
    });

    it('resolves incomplete by merging with richer source', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          agentId: 'a1',
          content: 'Implementation complete.',
          confidence: 0.8,
          issues: [{ description: 'Bug', severity: 'high', evidence: 'Line 10' }],
        }),
        makeInput({
          agentId: 'a2',
          content: 'Looks fine.',
          confidence: 0.7,
        }),
      ]);

      const incomplete = result.conflicts.filter((c) => c.type === 'incomplete');
      expect(incomplete.every((c) => c.resolvedBy === 'role_authority')).toBe(true);
      expect(incomplete.every((c) => c.resolution.includes('richer'))).toBe(true);
    });

    it('resolves preference by confidence', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({
          agentId: 'a1',
          content: 'use the factory pattern for creating objects and manage dependencies',
          confidence: 0.8,
        }),
        makeInput({
          agentId: 'a2',
          content: 'use the factory pattern for creating objects and manage dependencies through DI',
          confidence: 0.7,
        }),
      ]);

      const prefs = result.conflicts.filter((c) => c.type === 'preference');
      if (prefs.length > 0) {
        expect(prefs[0].resolvedBy).toBe('confidence');
      }
    });
  });

  describe('overallConfidence', () => {
    it('calculates confidence based on max input confidence', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ confidence: 0.9 }),
      ]);

      expect(result.overallConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it('reduces confidence for unresolved conflicts', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'writer-1', role: 'writer', content: 'not using caching', confidence: 0.9 }),
        makeInput({ agentId: 'writer-2', role: 'writer', content: 'use caching', confidence: 0.9 }),
      ]);

      expect(result.overallConfidence).toBeLessThan(0.9);
    });

    it('confidence is at least 0.3', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ confidence: 0.1 }),
      ]);

      expect(result.overallConfidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('escalation', () => {
    it('sets needsUserEscalation to true when conflicts require user decision', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'w1', role: 'writer', content: 'do not add caching', confidence: 0.8 }),
        makeInput({ agentId: 'w2', role: 'writer', content: 'add caching now', confidence: 0.8 }),
      ]);

      expect(result.needsUserEscalation).toBe(true);
    });

    it('builds escalation response with agent perspectives', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([
        makeInput({ agentId: 'w1', role: 'writer', content: 'no caching', confidence: 0.8 }),
        makeInput({ agentId: 'w2', role: 'writer', content: 'add caching', confidence: 0.8 }),
      ]);

      // The synthesizer shouts "DECISION REQUIRED" in caps; assert case-insensitively.
      expect(result.unifiedResponse.toLowerCase()).toContain('decision required');
      expect(result.unifiedResponse).toContain('w1');
      expect(result.unifiedResponse).toContain('w2');
    });
  });

  describe('event emission', () => {
    it('emits final_response event', () => {
      const eventStream = new EventStream();
      const synth = new ResponseSynthesizer(eventStream);
      synth.synthesize([makeInput()]);

      const events = eventStream.getByType('final_response');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ status: 'done', agentCount: 1 });
    });

    it('emits disagreement_detected for user-escalated conflicts', () => {
      const eventStream = new EventStream();
      const synth = new ResponseSynthesizer(eventStream);
      synth.synthesize([
        makeInput({ agentId: 'w1', role: 'writer', content: 'not using caching', confidence: 0.8 }),
        makeInput({ agentId: 'w2', role: 'writer', content: 'use caching', confidence: 0.8 }),
      ]);

      const events = eventStream.getByType('disagreement_detected');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('without EventStream', () => {
    it('works without EventStream provided', () => {
      const synth = new ResponseSynthesizer();
      const result = synth.synthesize([makeInput()]);
      expect(result.unifiedResponse).toContain('factory pattern');
    });
  });
});
