/**
 * Strict, fail-closed parser for reviewer verdicts. Shared by every real
 * review path (inline quality gate, `runReviewer`, the parallel quality gate,
 * and Trio's reviewer stage) so a malformed/absent verdict can never be
 * silently defaulted to PASS.
 *
 * Contract (whole-record strict — any malformed field rejects acceptance):
 *   - verdict must be exactly PASS | FAIL | NEEDS_REVISION (else NEEDS_REVISION)
 *   - confidence must be a finite number in [0,1] (else NEEDS_REVISION)
 *   - findings must be an array of {description,severity,evidence} strings with
 *     severity in high|med|low; any non-array/malformed entry rejects the record
 *   - non-JSON / empty content -> NEEDS_REVISION with no findings
 */
export type ReviewVerdictValue = 'PASS' | 'FAIL' | 'NEEDS_REVISION';

export interface ReviewFinding {
  description: string;
  severity: 'high' | 'med' | 'low';
  evidence: string;
}

export interface ParsedReview {
  verdict: ReviewVerdictValue;
  confidence: number;
  findings: ReviewFinding[];
  /** True when any part of the record failed strict validation. */
  malformed: boolean;
}

const VERDICTS = new Set<ReviewVerdictValue>(['PASS', 'FAIL', 'NEEDS_REVISION']);
const SEVERITIES = new Set(['high', 'med', 'low']);

/**
 * Strictly validate a findings array. Returns the array on success, or null if
 * any element is malformed — the whole record is rejected rather than
 * silently dropping offending findings.
 */
function asFindings(value: unknown): ReviewFinding[] | null {
  if (!Array.isArray(value)) return null;
  const out: ReviewFinding[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.description !== 'string' || typeof f.evidence !== 'string') return null;
    if (typeof f.severity !== 'string' || !SEVERITIES.has(f.severity)) return null;
    out.push({
      description: f.description,
      severity: f.severity as ReviewFinding['severity'],
      evidence: f.evidence,
    });
  }
  return out;
}

/** Parse raw reviewer content into a strictly-validated verdict. Fails closed. */
export function parseReviewVerdict(content: string): ParsedReview {
  let parsed: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed = obj as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const rawVerdict = parsed?.verdict;
  const verdictOk = typeof rawVerdict === 'string' && VERDICTS.has(rawVerdict as ReviewVerdictValue);
  const verdict: ReviewVerdictValue = verdictOk ? (rawVerdict as ReviewVerdictValue) : 'NEEDS_REVISION';

  const rawConfidence = parsed?.confidence;
  const confidenceOk =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1;
  const confidence = confidenceOk ? rawConfidence : 0;

  const findingsRaw = parsed?.findings ?? parsed?.issues;
  const findings = asFindings(findingsRaw);

  // Whole-record strict: if anything is malformed, the record is NEEDS_REVISION.
  const malformed = parsed === null || !verdictOk || !confidenceOk || findings === null;

  return {
    verdict: malformed ? 'NEEDS_REVISION' : verdict,
    confidence,
    findings: findings ?? [],
    malformed,
  };
}
