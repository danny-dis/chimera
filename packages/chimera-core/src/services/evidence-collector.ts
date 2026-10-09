// =============================================================================
// EvidenceCollector — produces deterministic verification evidence and provenance
// for every deliverable. Ensures Chimera never claims verification it did not perform.
// =============================================================================

import type { Evidence, EvidenceBundle, RunId, AgentId } from '@chimera/domain';

export interface VerificationStep {
  name: string;
  passed: boolean;
  evidence: string;
  timestamp: number;
}

export interface ProvenanceRecord {
  action: string;
  agentId: AgentId;
  runId: RunId;
  timestamp: number;
  inputs: string[];
  outputs: string[];
  toolCalls: string[];
}

/**
 * EvidenceCollector — collects and bundles verification evidence.
 */
export class EvidenceCollector {
  private evidences: Evidence[] = [];
  private provenance: ProvenanceRecord[] = [];

  /**
   * Add an evidence record.
   */
  addEvidence(evidence: Omit<Evidence, 'id' | 'timestamp'>): Evidence {
    const full: Evidence = {
      ...evidence,
      id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.evidences.push(full);
    return full;
  }

  /**
   * Add a provenance record.
   */
  addProvenance(record: Omit<ProvenanceRecord, 'timestamp'>): void {
    this.provenance.push({ ...record, timestamp: Date.now() });
  }

  /**
   * Get all evidences for a run.
   */
  getEvidencesForRun(runId: RunId): Evidence[] {
    return this.evidences.filter((e) => e.runId === runId);
  }

  /**
   * Build an evidence bundle for a run.
   */
  buildBundle(runId: RunId): EvidenceBundle {
    const evidences = this.getEvidencesForRun(runId);
    return {
      runId,
      evidences,
      summary: {
        total: evidences.length,
        passed: evidences.filter((e) => e.verdict === 'pass').length,
        failed: evidences.filter((e) => e.verdict === 'fail').length,
        needsRevision: evidences.filter((e) => e.verdict === 'needs_revision').length,
      },
      generatedAt: Date.now(),
    };
  }

  /**
   * Get provenance for a run.
   */
  getProvenanceForRun(runId: RunId): ProvenanceRecord[] {
    return this.provenance.filter((p) => p.runId === runId);
  }

  /**
   * Verify that all required checks passed.
   */
  verifyAllPassed(runId: RunId): boolean {
    const evidences = this.getEvidencesForRun(runId);
    if (evidences.length === 0) return false;
    return evidences.every((e) => e.verdict === 'pass');
  }

  /**
   * Get a summary of all evidence.
   */
  getSummary(): {
    totalEvidences: number;
    passed: number;
    failed: number;
    needsRevision: number;
    totalProvenance: number;
  } {
    return {
      totalEvidences: this.evidences.length,
      passed: this.evidences.filter((e) => e.verdict === 'pass').length,
      failed: this.evidences.filter((e) => e.verdict === 'fail').length,
      needsRevision: this.evidences.filter((e) => e.verdict === 'needs_revision').length,
      totalProvenance: this.provenance.length,
    };
  }

  /**
   * Clear all evidence and provenance.
   */
  clear(): void {
    this.evidences = [];
    this.provenance = [];
  }
}
