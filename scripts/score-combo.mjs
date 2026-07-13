// scripts/score-combo.mjs
// Pure, side-effect-free quality stand-in for the matrix. Extracted from
// matrix-disk.mjs so it can be unit-tested without running live API calls.
//
// Not a real LLM judge (that path is unwired) — a transparent scalar (0-1)
// from evidence the harness already collects, so the "more agents = better"
// curve can be plotted.
//
// 0.5 base; +0.25 landed a valid target file (disk success); +0.15 used tools;
// +0.10 no error events. needs_user counts as partial (0.35) since a file may
// exist but needs review. error/throw = 0.
//
// NOTE: swarm is a text-only deliberation preset (no tools), so its caller
// passes disk=null — it is scored on status/events only and never penalized
// by a file-on-disk gate it cannot satisfy.
export function scoreCombo({ mode, preset, status, disk, diskWrites, toolCalls, evErrors }) {
  if (status === 'error' || status === 'throw') return 0;
  if (status === 'needs_user') return 0.35;
  let s = 0.5;
  if (disk && disk.targetExists && disk.broken === 0) s += 0.25;
  if (toolCalls > 0 || diskWrites > 0) s += 0.15;
  if (evErrors.length === 0) s += 0.10;
  return Math.min(1, s);
}
