const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '..');
const implementation = ['calc.js', 'mathops.js'];
const hash = value => createHash('sha256').update(value).digest('hex');

function snapshot(root, prefix = '') {
  const files = Object.create(null);
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name;
    // ponytail: .git metadata excluded; boundary hashes cannot detect edit-and-restore.
    if (name === '.git') continue;
    const target = path.join(root, name);
    if (entry.isSymbolicLink()) files[name] = 'symlink:' + fs.readlinkSync(target);
    else if (entry.isDirectory()) Object.assign(files, { [name + '/']: 'directory' }, snapshot(root, name + '/'));
    else files[name] = hash(fs.readFileSync(target));
  }
  return files;
}

function auditMutations(before, after, readOnly = false, allowHostMemory = false) {
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => before[name] !== after[name]).sort();
  // ponytail: exact runtime paths, not proof of write origin or a workspace-wide exemption.
  const hostStateChanged = allowHostMemory ? changed.filter(name =>
    (['.chimera/', '.chimera/memory/'].includes(name) && after[name] === 'directory' && (!before[name] || before[name] === 'directory'))
    || (name === '.chimera/memory/long-term.json' && after['.chimera/memory/'] === 'directory'
      && /^[a-f0-9]{64}$/.test(after[name] ?? '') && (!before[name] || /^[a-f0-9]{64}$/.test(before[name])))) : [];
  const unexpected = changed.filter(name => !hostStateChanged.includes(name) && (readOnly || !implementation.includes(name)));
  return { changed, hostStateChanged, unexpected, allowed: unexpected.length === 0,
    intendedFilesChanged: implementation.every(name => changed.includes(name) && before[name] && after[name]) };
}

async function prepareFeature(root) {
  const { TASKS } = await import('./task-suite.mjs');
  const runId = randomUUID();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'existing-calculator', private: true, type: 'commonjs' }) + '\n');
  fs.writeFileSync(path.join(root, 'mathops.js'), 'module.exports = { add: (a,b)=>a+b, mul: (a,b)=>a*b };\n');
  fs.writeFileSync(path.join(root, TASKS.code_multi.target), "const ops = require('./mathops.js');\nmodule.exports = { calc: (op,a,b) => op==='add' ? ops.add(a,b) : op==='mul' ? ops.mul(a,b) : null };\n");
  const verifier = [
    "const assert = require('node:assert/strict');",
    `const m = require(${JSON.stringify('./' + TASKS.code_multi.target)});`,
    ...TASKS.code_multi.tests.map(([label, expression, expected]) => `assert.deepEqual((${expression}), ${JSON.stringify(expected)}, ${JSON.stringify(label)});`),
    "const ops = require('./mathops.js');",
    "assert.equal(typeof ops.sub, 'function');",
    'assert.equal(ops.sub(9,4), 5); assert.equal(ops.sub(-2,3), -5);',
    "assert.equal(m.calc('sub',9,4), 5); assert.equal(m.calc('sub',-2,3), -5);",
    "ops.sub = () => 917; delete require.cache[require.resolve('./calc.js')];",
    "assert.equal(require('./calc.js').calc('sub',9,4), 917, 'calc must call the mathops export');",
    `process.stdout.write(JSON.stringify({ runId: ${JSON.stringify(runId)}, verified: true }));`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(root, 'verify.cjs'), verifier);
  const seed = spawnSync(process.execPath, ['verify.cjs'], { cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.equal(seed.status, 1, 'Existing seed must fail the new feature assertion');
  const req = createRequire(path.join(repo, 'packages/chimera-cli/package.json'));
  return { runId, verifier, seedFailed: true, before: snapshot(root),
    prompt: 'Extend this existing CommonJS calculator with subtraction. Edit mathops.js to export sub(a,b) and calc.js to dispatch calc("sub",a,b) through that export. Preserve add, mul and unknown-op behavior. Change only these two implementation files; never modify verify.cjs or package.json, add dependencies, or replace the framework. Run node verify.cjs.',
    provenance: { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
      dirtyScope: execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/),
      node: process.execPath, nodeVersion: process.version, nodeModules: fs.realpathSync(path.join(repo, 'node_modules')),
      cliRouter: req.resolve('./dist/cli-router.js'), core: req.resolve('@chimera/core'),
      driverHash: hash(fs.readFileSync(path.join(__dirname, 'test-live-mode-presets.cjs'))),
      helperHash: hash(fs.readFileSync(__filename)), taskSuiteHash: hash(fs.readFileSync(path.join(__dirname, 'task-suite.mjs'))) } };
}

function assessCoverage(parsed, requested, { release = false, coding = false } = {}) {
  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  const attempt = events.slice(events.findLastIndex(event => event.type === 'verification_repair_started') + 1);
  const resolutions = (release ? attempt : events).filter(event => event.type === 'mode_preset_resolved');
  const last = release ? resolutions.at(-1) : resolutions.length === 1 ? resolutions[0] : null;
  const resolution = last ? { mode: last.mode, preset: last.preset } : null;
  const expectedRemap = requested.preset === 'swarm' ? { from: 'swarm', to: 'trio', when: 'resolved mode code/debug', observed: resolution?.preset === 'trio' && ['code', 'debug'].includes(resolution?.mode) } : null;
  const tail = last ? attempt.slice(attempt.lastIndexOf(last) + 1) : [];
  const completions = tail.filter(event => event.type === 'deliberation_executed');
  const leaf = completions.filter(event => event.preset !== 'auto').at(-1);
  const selection = tail.filter(event => event.type === 'auto_preset_selected').at(-1);
  const autoRoot = resolution?.preset === 'auto' || !!selection || completions.some(event => event.preset === 'auto');
  const completed = event => event?.mode === resolution?.mode && event?.degraded === false && event?.resultMode === event?.preset;
  const root = completions.at(-1);
  const expected = autoRoot ? selection?.selectedPreset : resolution?.preset;
  const proven = !!(release && resolution && leaf && completed(leaf) && leaf.preset === expected
    && ['solo', 'duo', 'trio', 'fusion', 'merge', 'hive', 'swarm'].includes(leaf.preset)
    && (requested.mode === 'auto' || requested.mode === resolution.mode)
    && (!coding || ['code', 'debug', 'oal'].includes(resolution.mode))
    && (requested.preset === 'auto' || resolution.preset === (expectedRemap?.observed ? 'trio' : requested.preset))
    && (autoRoot ? requested.preset === 'auto' && selection && tail.indexOf(selection) < tail.indexOf(leaf)
      && root?.preset === 'auto' && completed(root) : root === leaf));
  return { requested, resolved: resolution, executed: release && leaf ? { mode: leaf.mode, preset: leaf.preset } : null,
    expectedRemap, resolutionEvidence: resolution ? 'result.events.mode_preset_resolved (not execution proof)' : 'missing or ambiguous',
    executionEvidence: proven ? 'result.events.deliberation_executed (completed non-degraded handler)' : 'missing or mismatched completion',
    nativePresetProven: proven && requested.preset === leaf.preset && !expectedRemap?.observed,
    autoCodingProven: proven && coding && requested.mode === 'auto', passed: !release || proven,
    ceiling: release ? 'Handler execution is not provider-quality certification; remapped presets are not native strategy proof.'
      : 'No executed-preset telemetry established by this slice; fixture success is not native strategy or live coding readiness.' };
}

function assessFeature(root, fixture, result, parsed, requested, { release = false } = {}) {
  const afterChild = snapshot(root);
  const mutation = auditMutations(fixture.before, afterChild, ['ask', 'plan', 'review'].includes(requested.mode), true);
  const verifierUntouched = afterChild['verify.cjs'] === fixture.before['verify.cjs'];
  let artifactVerified = false, verifierExit = null, verifierTimedOut = false;
  if (verifierUntouched) {
    const check = spawnSync(process.execPath, ['verify.cjs'], { cwd: root, encoding: 'utf8', timeout: 5000 });
    verifierExit = check.status;
    verifierTimedOut = check.error?.code === 'ETIMEDOUT';
    let output; try { output = JSON.parse(check.stdout); } catch {}
    artifactVerified = check.status === 0 && !check.signal && !check.error && output?.verified === true && output?.runId === fixture.runId;
  }
  const afterVerifier = snapshot(root);
  const verifierMutation = auditMutations(afterChild, afterVerifier, true);
  const coverage = assessCoverage(parsed, requested, { release, coding: true });
  const identityMatches = typeof fixture.runId === 'string' && result.runId === fixture.runId;
  const passed = result.code === 0 && result.signal === null && !result.timedOut && identityMatches && parsed?.status === 'done'
    && parsed?.verification?.verified === true && fixture.seedFailed && artifactVerified && verifierUntouched
    && mutation.allowed && mutation.intendedFilesChanged && verifierMutation.allowed && coverage.passed;
  return { scenario: 'existing-commonjs-feature', runId: fixture.runId, identityMatches, provenance: fixture.provenance,
    exitCode: result.code, signal: result.signal, timedOut: result.timedOut, pid: result.pid,
    artifactVerified, verifierExit, verifierTimedOut, verifierUntouched, mutation, verifierMutation,
    snapshots: { before: fixture.before, afterChild, afterVerifier },
    coverage,
    passed: !!passed };
}

module.exports = { prepareFeature, assessFeature, assessCoverage, snapshot, auditMutations };
