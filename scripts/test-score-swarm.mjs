// scripts/test-score-swarm.mjs
// Offline verification of the swarm disk-gate fix. scoreCombo() is pure
// (no I/O), so we import the live function from matrix-disk.mjs and assert
// the two cases that the gate change affects:
//   code/swarm  -> previously penalized to needs_user (0.35) by a missing
//                  disk target it can never produce; now scored on status
//                  + events only (swarm is text-only deliberation).
//   debug/swarm -> previously a false "done" with disk bonus (0.85); the
//                  target existed only because the matrix pre-seeded bug.js.
import { scoreCombo } from './score-combo.mjs';

const cases = [
  // [label, args, expectedMin, note]
  ['code/swarm done (real output, no tools, no errors)',
    { mode: 'code', preset: 'swarm', status: 'done', disk: null, diskWrites: 0, toolCalls: 0, evErrors: [] },
    0.60, 'base 0.5 + 0.10 no errors = 0.60 (no false disk penalty)'],
  ['debug/swarm done (pre-seeded target, no swarm write)',
    { mode: 'debug', preset: 'swarm', status: 'done', disk: null, diskWrites: 0, toolCalls: 0, evErrors: [] },
    0.60, 'same honest score; no false +0.25 disk bonus'],
  ['code/swarm needs_user (gate no longer forces this, but if it happens)',
    { mode: 'code', preset: 'swarm', status: 'needs_user', disk: null, diskWrites: 0, toolCalls: 0, evErrors: [] },
    0.35, 'unchanged partial'],
  ['code/duo done with valid file (regression guard)',
    { mode: 'code', preset: 'duo', status: 'done', disk: { targetExists: true, broken: 0 }, diskWrites: 1, toolCalls: 1, evErrors: [] },
    0.85, 'code/duo still gets the disk bonus (+0.25 +0.15 +0.10)'],
];

let ok = true;
for (const [label, args, expectedMin, note] of cases) {
  const s = scoreCombo(args);
  const pass = s >= expectedMin - 1e-9;
  ok = ok && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  -> score=${s.toFixed(2)} (min ${expectedMin})  [${note}]`);
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
