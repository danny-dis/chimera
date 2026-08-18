// scripts/test-grade-task.mjs
// Offline proof that the objective grader DISCRIMINATES (no API calls).
//
// The whole premise of BUG-3/BUG-4 is that a careless first draft must score
// LOWER than a correct implementation. The old rubric could not tell them
// apart: both "finished + wrote a file + no error event" => 1.00. Here we
// write known-good and known-careless artifacts by hand and assert the
// grader separates them.

import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gradeTask, seedTask } from './grade-task.mjs';

function fresh() { return mkdtempSync(join(tmpdir(), 'chimera-grade-')); }

const cases = [];

// --- code: correct slugify -> expect 1.0 -------------------------------
{
  const d = fresh();
  writeFileSync(join(d, 'slugify.js'), `
module.exports = function slugify(input) {
  if (typeof input !== 'string') return '';
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};
`);
  cases.push(['code / correct', 'code', d, 1.0, 'exact']);
}

// --- code: careless slugify (no type guard, no dash collapse) ----------
// Ships happily, crashes on null, leaves "a---b". Old rubric: 1.00.
{
  const d = fresh();
  writeFileSync(join(d, 'slugify.js'), `
module.exports = function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '-');
};
`);
  cases.push(['code / careless', 'code', d, 0.9, 'below']);
}

// --- code: parses but throws on load -> 0 ------------------------------
{
  const d = fresh();
  writeFileSync(join(d, 'slugify.js'), `throw new Error('boom at load');\n`);
  cases.push(['code / unloadable', 'code', d, 0.0, 'exact']);
}

// --- code: missing target -> 0 ----------------------------------------
{
  const d = fresh();
  cases.push(['code / missing file', 'code', d, 0.0, 'exact']);
}

// --- debug: both bugs fixed -> 1.0 ------------------------------------
{
  const d = fresh();
  seedTask('debug', d);
  writeFileSync(join(d, 'stats.js'), `
function lastIndex(arr) { return arr.length - 1; }
function average(arr) { if (!arr.length) return 0; return arr.reduce((a,b)=>a+b,0)/arr.length; }
module.exports = { lastIndex: lastIndex, average: average };
`);
  cases.push(['debug / both bugs fixed', 'debug', d, 1.0, 'exact']);
}

// --- debug: obvious bug fixed, SUBTLE one missed -----------------------
// This is the key case: fixes the off-by-one, still divides by zero on [].
// Must score strictly between 0 and 1, or the metric has no headroom for a
// reviewer pass to demonstrate value.
{
  const d = fresh();
  seedTask('debug', d);
  writeFileSync(join(d, 'stats.js'), `
function lastIndex(arr) { return arr.length - 1; }
function average(arr) { var t=0; for (var i=0;i<arr.length;i++) t+=arr[i]; return t/arr.length; }
module.exports = { lastIndex: lastIndex, average: average };
`);
  cases.push(['debug / subtle bug missed', 'debug', d, 1.0, 'strictly-between']);
}

// --- code_multi: consistent two files -> 1.0 --------------------------
{
  const d = fresh();
  writeFileSync(join(d, 'mathops.js'), `
module.exports = { add: (a,b)=>a+b, mul: (a,b)=>a*b };
`);
  writeFileSync(join(d, 'calc.js'), `
const ops = require('./mathops.js');
module.exports = { calc: (op,a,b) => op==='add' ? ops.add(a,b) : op==='mul' ? ops.mul(a,b) : null };
`);
  cases.push(['code_multi / consistent', 'code_multi', d, 1.0, 'exact']);
}

// --- code_multi: files DISAGREE on export name -----------------------
// calc.js requires .plus/.times which mathops.js never exports. The classic
// single-pass cross-file failure the old suite never tested.
{
  const d = fresh();
  writeFileSync(join(d, 'mathops.js'), `
module.exports = { add: (a,b)=>a+b, mul: (a,b)=>a*b };
`);
  writeFileSync(join(d, 'calc.js'), `
const ops = require('./mathops.js');
module.exports = { calc: (op,a,b) => op==='add' ? ops.plus(a,b) : op==='mul' ? ops.times(a,b) : null };
`);
  cases.push(['code_multi / name mismatch', 'code_multi', d, 1.0, 'below']);
}

let ok = true;
const scores = {};
for (const [label, mode, dir, bound, kind] of cases) {
  const g = gradeTask(mode, dir);
  const r = g.ratio;
  scores[label] = r;
  let pass;
  if (kind === 'exact') pass = Math.abs(r - bound) < 1e-9;
  else if (kind === 'below') pass = r < bound;
  else if (kind === 'strictly-between') pass = r > 0 && r < 1;
  else pass = false;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(30)} ratio=${r === null ? 'n/a' : r.toFixed(2)} (${g.passed}/${g.total}) ${kind} ${bound}`);
  if (!pass) {
    ok = false;
    console.log(`      failures: ${(g.failures || []).slice(0, 4).join('; ')}`);
    if (g.loadError) console.log(`      loadError: ${g.loadError.slice(0, 120)}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

// The discrimination assertions — the actual point of this file.
console.log('\n=== DISCRIMINATION ===');
const checks = [
  ['correct code > careless code', scores['code / correct'] > scores['code / careless']],
  ['correct debug > subtle-miss debug', scores['debug / both bugs fixed'] > scores['debug / subtle bug missed']],
  ['consistent multi > mismatched multi', scores['code_multi / consistent'] > scores['code_multi / name mismatch']],
  ['unloadable scores 0', scores['code / unloadable'] === 0],
];
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) ok = false;
}

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
