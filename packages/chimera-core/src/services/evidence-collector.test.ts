import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceCollector } from './evidence-collector.js';

describe('EvidenceCollector', () => {
  let collector: EvidenceCollector;

  beforeEach(() => {
    collector = new EvidenceCollector();
  });

  describe('addEvidence', () => {
    it('adds evidence with generated id and timestamp', () => {
      const evidence = collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'All tests passed',
        severity: 'info',
        data: { passed: 5, failed: 0 },
      });
      expect(evidence.id).toContain('evidence-');
      expect(evidence.timestamp).toBeGreaterThan(0);
    });
  });

  describe('addProvenance', () => {
    it('adds a provenance record', () => {
      collector.addProvenance({
        action: 'write_file',
        agentId: 'agent-1',
        runId: 'run-1',
        inputs: ['task'],
        outputs: ['file.ts'],
        toolCalls: ['write_file'],
      });
      const provenance = collector.getProvenanceForRun('run-1');
      expect(provenance).toHaveLength(1);
      expect(provenance[0].action).toBe('write_file');
    });
  });

  describe('getEvidencesForRun', () => {
    it('returns evidences for a specific run', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      collector.addEvidence({
        runId: 'run-2',
        agentId: 'agent-2',
        type: 'test_result',
        verdict: 'fail',
        description: 'Tests failed',
        severity: 'high',
        data: {},
      });
      const run1Evidences = collector.getEvidencesForRun('run-1');
      expect(run1Evidences).toHaveLength(1);
      expect(run1Evidences[0].verdict).toBe('pass');
    });
  });

  describe('buildBundle', () => {
    it('builds an evidence bundle for a run', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'lint',
        verdict: 'pass',
        description: 'Lint passed',
        severity: 'info',
        data: {},
      });
      const bundle = collector.buildBundle('run-1');
      expect(bundle.runId).toBe('run-1');
      expect(bundle.summary.total).toBe(2);
      expect(bundle.summary.passed).toBe(2);
      expect(bundle.summary.failed).toBe(0);
    });
  });

  describe('verifyAllPassed', () => {
    it('returns true when all evidences pass', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      expect(collector.verifyAllPassed('run-1')).toBe(true);
    });

    it('returns false when any evidence fails', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'lint',
        verdict: 'fail',
        description: 'Lint failed',
        severity: 'high',
        data: {},
      });
      expect(collector.verifyAllPassed('run-1')).toBe(false);
    });

    it('returns false when no evidences exist', () => {
      expect(collector.verifyAllPassed('run-1')).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('returns summary of all evidence', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'lint',
        verdict: 'fail',
        description: 'Lint failed',
        severity: 'high',
        data: {},
      });
      collector.addProvenance({
        action: 'write_file',
        agentId: 'agent-1',
        runId: 'run-1',
        inputs: [],
        outputs: [],
        toolCalls: [],
      });
      const summary = collector.getSummary();
      expect(summary.totalEvidences).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.totalProvenance).toBe(1);
    });
  });

  describe('clear', () => {
    it('clears all evidence and provenance', () => {
      collector.addEvidence({
        runId: 'run-1',
        agentId: 'agent-1',
        type: 'test_result',
        verdict: 'pass',
        description: 'Tests passed',
        severity: 'info',
        data: {},
      });
      collector.clear();
      expect(collector.getSummary().totalEvidences).toBe(0);
    });
  });
});
