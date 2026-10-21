const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync, execFileSync } = require('node:child_process');
const driver = path.join(__dirname, 'test-live-mode-presets.cjs');
const { hasUsefulPlan, assertSourceCombos } = require(driver);
const source = fs.readFileSync(path.join(__dirname, '../packages/chimera-core/src/session-orchestrator.ts'), 'utf8');
const text = fs.readFileSync(driver, 'utf8');
const contentExpression = text.match(/const contentVerified = (.*);/)[1];
const passedExpression = text.match(/passed: (.*?) };/)[1];
const plan = '1. Create hello.js as a Node.js CLI that prints hello.\n2. Verify by running node hello.js and assert stdout equals hello.';
const prosePlan = 'Implement the CLI in bin/hello.cjs with console.log("hello"). Run node bin/hello.cjs to confirm hello is printed and check exit code zero.';
const failures = [undefined, null, {}, '', ' \n\t ', '[chimera] both models failed\n\n[chimera] both models failed.', 'Both models failed: provider unavailable.', 'Empty response', 'Error: provider unavailable; create hello.js and verify with node hello.js.', '[chimera] failure: empty provider result\n' + plan, 'I will write a detailed implementation plan later, once I can inspect the repository.', 'Create hello.js to print hello without running anything.'];
for (const output of failures) {
  assert.equal(hasUsefulPlan(output), false, JSON.stringify(output));
  const context = { hasUsefulPlan, coding: false, mode: 'plan', parsed: { status: 'done', output }, result: { code: 0, timedOut: false }, verifierUntouched: true };
  context.contentVerified = vm.runInNewContext(contentExpression, context);
  assert.equal(vm.runInNewContext(passedExpression, context), false, 'Even status=done must not rescue failed/empty output');
}
for (const output of [plan, prosePlan]) assert.equal(hasUsefulPlan(output), true);
const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(' + JSON.stringify({ status: 'done', output: plan }) + '))'], { encoding: 'utf8', timeout: 5000 });
assert.equal(child.status, 0);
const context = { hasUsefulPlan, coding: false, mode: 'plan', parsed: JSON.parse(child.stdout), result: { code: child.status, timedOut: false }, verifierUntouched: true };
context.contentVerified = vm.runInNewContext(contentExpression, context);
assert.equal(vm.runInNewContext(passedExpression, context), true);
const failedChild = spawnSync(process.execPath, ['-e', 'process.exit(7)'], { timeout: 5000 });
assert.equal(failedChild.status, 7);
for (const changes of [{ result: { code: failedChild.status, timedOut: false } }, { result: { code: null, timedOut: false } }, { result: { code: 0, timedOut: true } }, { parsed: { status: 'needs_user', output: plan } }, { verifierUntouched: false }]) {
  assert.equal(vm.runInNewContext(passedExpression, { ...context, ...changes }), false);
}
const coding = { ...context, coding: true, mode: 'code', artifactVerified: true, seedFailed: true, parsed: { status: 'done', verification: { verified: true } } };
coding.contentVerified = vm.runInNewContext(contentExpression, coding);
assert.equal(vm.runInNewContext(passedExpression, coding), true);
for (const changes of [{ artifactVerified: false }, { parsed: { status: 'done', verification: { verified: false } } }, { seedFailed: false }, { verifierUntouched: false }]) {
  const candidate = { ...coding, ...changes };
  candidate.contentVerified = vm.runInNewContext(contentExpression, candidate);
  assert.equal(vm.runInNewContext(passedExpression, candidate), false);
}
assertSourceCombos(source);
assert.throws(() => assertSourceCombos(source.replace("plan:   ['solo', 'duo']", "plan:   ['solo', 'trio']")), /drifted/);
assert.throws(() => assertSourceCombos('const VALID_MODE_PRESET_COMBOS = dynamic();'), /Cannot read/);
assert.throws(() => assertSourceCombos('const VALID_MODE_PRESET_COMBOS = {\nplan: invalid\n};'), SyntaxError);
const listed = spawnSync(process.execPath, [driver, '--list'], { encoding: 'utf8', timeout: 5000 });
assert.equal(listed.status, 0, listed.stderr);
const rows = JSON.parse(listed.stdout);
assert.equal(rows.length, 29);
assertSourceCombos(source, rows.slice().reverse());
assert.throws(() => assertSourceCombos(source, rows.map((row, i) => i === 0 ? { ...row, preset: 'duo' } : row)), /drifted/);
assert.throws(() => assertSourceCombos(source, rows.slice(1)), /drifted/);
const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'chimera-verifier-order-'));
try {
  const verifier = 'process.exit(0);\n';
  const replacement = `require('node:fs').writeFileSync(__filename,${JSON.stringify(verifier)});process.exit(0);`;
  const blockStart = text.includes('      const verifierBefore =') ? text.indexOf('      const verifierBefore =') : text.indexOf('      let artifactVerified = false;');
  const block = text.slice(blockStart, text.indexOf('      const contentVerified ='));
  assert.ok(block.includes('const verifierUntouched'));
  const check = () => vm.runInNewContext(block + '\n({artifactVerified,verifierUntouched})', { fs, path, root, verifier, coding: true, fixture: undefined, execFileSync, process });
  fs.writeFileSync(path.join(root, 'verify.cjs'), replacement);
  let observed = check();
  assert.equal(observed.verifierUntouched, false, 'Self-restoring replacement must be rejected before it runs');
  assert.equal(observed.artifactVerified, false);
  assert.equal(fs.readFileSync(path.join(root, 'verify.cjs'), 'utf8'), replacement);
  fs.unlinkSync(path.join(root, 'verify.cjs'));
  observed = check();
  assert.equal(observed.verifierUntouched, false);
  assert.equal(observed.artifactVerified, false);
  fs.writeFileSync(path.join(root, 'verify.cjs'), verifier);
  observed = check();
  assert.equal(observed.verifierUntouched, true);
  assert.equal(observed.artifactVerified, true);
} finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
console.log(JSON.stringify({ offline: true, driver: require.resolve(driver), rejectedPlans: failures.length, acceptedPlans: 2, sourceCombos: rows.length, subprocessAndVerifierGates: 'passed' }));
