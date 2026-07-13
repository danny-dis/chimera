// scripts/test-file-landed.mjs
// Deterministic unit check for the prose-fallback gate fix. No live API.
import { fileLandedOnDisk } from '../packages/chimera-core/dist/coordinator/path-from-task.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const dir = mkdtempSync(join(tmpdir(), 'landed-'));
try {
  // No file yet → fallback should run (gate true)
  assert('absent → not landed', fileLandedOnDisk('Write greeter.js that says hi', dir) === false);
  // Write the expected file → fallback should be skipped (gate false)
  writeFileSync(join(dir, 'greeter.js'), 'console.log("hi")');
  assert('present → landed', fileLandedOnDisk('Write greeter.js that says hi', dir) === true);
  // Task with no filename → never lands (gate false-safe, no crash)
  assert('no filename → false', fileLandedOnDisk('just say hello', dir) === false);
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
