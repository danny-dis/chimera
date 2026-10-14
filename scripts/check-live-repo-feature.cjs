const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execute } = require('./test-live-mode-presets.cjs');
const { prepareFeature, assessFeature, snapshot, auditMutations } = require('./live-repo-feature.cjs');
const memoryModule = require.resolve('../packages/chimera-core/dist/memory/memory-persistence.js');
const { MemoryPersistence } = require(memoryModule);

(async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-feature-check-'));
  const rows = [];
  let provenance;
  try {
    const childPath = path.join(sandbox, 'controlled-child.cjs');
    fs.writeFileSync(childPath, [
      "const fs = require('node:fs');",
      'const action = process.argv[2];',
      "const math = 'module.exports = { add: (a,b)=>a+b, mul: (a,b)=>a*b, sub: (a,b)=>a-b };\\n';",
      "const calc = \"const ops = require('./mathops.js');\\nmodule.exports = { calc: (op,a,b) => op==='add' ? ops.add(a,b) : op==='mul' ? ops.mul(a,b) : op==='sub' ? ops.sub(a,b) : null };\\n\";",
      "if (action !== 'noop') fs.writeFileSync('mathops.js', math);",
      "if (!['noop', 'one-file'].includes(action)) fs.writeFileSync('calc.js', action === 'mismatch' ? calc.replace('ops.sub(a,b)', 'ops.subtract(a,b)') : action === 'inline' ? calc.replace('ops.sub(a,b)', 'a-b') : calc);",
      "if (action === 'verifier') fs.writeFileSync('verify.cjs', 'process.exit(0)');",
      "if (action === 'delete-verifier') fs.unlinkSync('verify.cjs');",
      "if (action === 'extra') { fs.mkdirSync('nested'); fs.writeFileSync('nested/extra.js', ''); }",
      "if (action === 'prototype-file') fs.writeFileSync('__proto__', 'unexpected');",
      "if (action === 'delete') fs.unlinkSync('package.json');",
      "if (action === 'dependency') fs.writeFileSync('package.json', JSON.stringify({ dependencies: { unwanted: '*' }, type: 'module' }));",
      "if (action === 'host-config') fs.writeFileSync('.chimera/config.yaml', 'changed');",
      "if (action === 'host-extra') fs.writeFileSync('.chimera/extra.json', '{}');",
      "if (action === 'host-memory-extra') fs.writeFileSync('.chimera/memory/extra.json', '{}');",
      "if (action === 'host-verifier') fs.writeFileSync('.chimera/memory/verify.cjs', 'process.exit(0)');",
      "if (action === 'host-delete') fs.unlinkSync('.chimera/memory/long-term.json');",
      "process.stdout.write(JSON.stringify({ status: 'done', verification: { verified: true }, events: [{ type: 'mode_preset_resolved', mode: 'code', preset: process.argv[3] }] }));",
      "if (action === 'exit7') process.exitCode = 7;",
      "if (action === 'timeout') setInterval(() => {}, 1000);",
    ].join('\n'));
    const cases = [
      ['correct', 'code', 'solo', true],
      ['correct', 'auto', 'auto', true],
      ['correct', 'code', 'swarm', true],
      ['noop', 'code', 'solo', false],
      ['one-file', 'code', 'solo', false],
      ['mismatch', 'code', 'solo', false],
      ['inline', 'code', 'solo', false],
      ['verifier', 'code', 'solo', false],
      ['delete-verifier', 'code', 'solo', false],
      ['extra', 'code', 'solo', false],
      ['prototype-file', 'code', 'solo', false],
      ['delete', 'code', 'solo', false],
      ['dependency', 'code', 'solo', false],
      ['exit7', 'code', 'solo', false],
      ['timeout', 'code', 'solo', false],
      ['correct', 'review', 'swarm', false],
      ['host-correct', 'code', 'solo', true],
      ['host-config', 'code', 'solo', false],
      ['host-extra', 'code', 'solo', false],
      ['host-memory-extra', 'code', 'solo', false],
      ['host-verifier', 'code', 'solo', false],
      ['host-delete', 'code', 'solo', false],
      ['verifier-host-mutation', 'code', 'solo', false],
    ];
    for (const [action, mode, preset, expected] of cases) {
      console.error(JSON.stringify({ offlineCase: action, mode, preset, phase: 'start' }));
      const root = fs.mkdtempSync(path.join(sandbox, 'repo-'));
      fs.mkdirSync(path.join(root, '.chimera'));
      fs.writeFileSync(path.join(root, '.chimera/config.yaml'), '{"fixture":true}\n');
      const fixture = await prepareFeature(root);
      provenance ??= fixture.provenance;
      assert.deepEqual(auditMutations(fixture.before, snapshot(root), true).changed, []);
      if (action.startsWith('host-') || action === 'verifier-host-mutation') {
        const persistence = new MemoryPersistence({ workspaceRoot: root });
        await persistence.getMemory().ready;
        const startup = auditMutations(fixture.before, snapshot(root), true, true);
        assert.equal(startup.allowed, true);
        assert.deepEqual(startup.hostStateChanged, ['.chimera/memory/']);
        await persistence.getMemory().write({ content: 'Controlled built host persistence, no model output.', topic: 'fixture' });
        const persisted = snapshot(root);
        assert.equal(auditMutations(fixture.before, persisted, true, true).allowed, true);
        assert.equal(auditMutations(fixture.before, persisted, true).allowed, false);
        if (action === 'host-delete') fixture.before = persisted;
        if (action === 'verifier-host-mutation') {
          fixture.verifier += "require('node:fs').appendFileSync('.chimera/memory/long-term.json', ' ');\n";
          fs.writeFileSync(path.join(root, 'verify.cjs'), fixture.verifier);
          fixture.before = snapshot(root);
        }
      }
      const result = await execute([childPath, action, preset === 'swarm' ? 'trio' : 'solo'], root, process.env,
        { runId: fixture.runId, timeoutMs: action === 'timeout' ? 1200 : 5000 });
      const parsed = JSON.parse(result.stdout);
      const row = assessFeature(root, fixture, result, parsed, { mode, preset });
      assert.equal(row.passed, expected, `${action} ${mode}/${preset}`);
      assert.equal(row.coverage.executed, null);
      assert.equal(row.coverage.nativePresetProven, false);
      assert.equal(row.coverage.autoCodingProven, false);
      if (action === 'timeout') {
        assert.equal(result.timedOut, true);
        assert.throws(() => process.kill(result.pid, 0), error => error.code === 'ESRCH', 'Timed-out child must be gone');
      } else assert.equal(result.timedOut, false);
      if (action === 'exit7') assert.equal(result.code, 7);
      if (expected) {
        assert.deepEqual(row.mutation.changed.filter(name => !row.mutation.hostStateChanged.includes(name)), ['calc.js', 'mathops.js']);
        if (action === 'host-correct') assert.deepEqual(row.mutation.hostStateChanged, ['.chimera/memory/', '.chimera/memory/long-term.json']);
        assert.equal(row.verifierExit, 0);
        assert.equal(row.verifierUntouched, true);
        assert.equal(row.verifierMutation.allowed, true);
        const wrongRun = assessFeature(root, fixture, { ...result, runId: 'stale-run' }, parsed, { mode, preset });
        assert.equal(wrongRun.passed, false);
        assert.equal(wrongRun.identityMatches, false);
        for (const replacement of [{ code: null }, { signal: 'SIGTERM' }, { timedOut: true }]) {
          assert.equal(assessFeature(root, fixture, { ...result, ...replacement }, parsed, { mode, preset }).passed, false);
        }
        for (const replacement of [{ status: 'needs_user' }, { verification: { verified: false } }]) {
          assert.equal(assessFeature(root, fixture, result, { ...parsed, ...replacement }, { mode, preset }).passed, false);
        }
        const noResolution = assessFeature(root, fixture, result, { ...parsed, events: [] }, { mode, preset });
        assert.equal(noResolution.coverage.resolved, null);
        const ambiguous = assessFeature(root, fixture, result, { ...parsed, events: [...parsed.events, ...parsed.events] }, { mode, preset });
        assert.equal(ambiguous.coverage.resolved, null);
        if (preset === 'swarm') assert.deepEqual(row.coverage.expectedRemap, { from: 'swarm', to: 'trio', when: 'resolved mode code/debug', observed: true });
        if (mode === 'auto') assert.deepEqual(row.coverage.requested, { mode: 'auto', preset: 'auto' });
      }
      if (action === 'one-file') assert.equal(row.mutation.intendedFilesChanged, false);
      if (action === 'mismatch' || action === 'inline') assert.equal(row.artifactVerified, false);
      if (['verifier', 'delete-verifier'].includes(action)) assert.equal(row.verifierUntouched, false);
      if (['extra', 'prototype-file', 'delete', 'dependency'].includes(action) || mode === 'review') assert.equal(row.mutation.allowed, false);
      if (action.startsWith('host-') && action !== 'host-correct') assert.equal(row.mutation.allowed, false);
      if (action === 'verifier-host-mutation') {
        assert.equal(row.verifierUntouched, true);
        assert.equal(row.artifactVerified, true);
        assert.equal(row.verifierMutation.allowed, false);
        assert.deepEqual(row.verifierMutation.unexpected, ['.chimera/memory/long-term.json']);
      }
      rows.push({ action, requested: { mode, preset }, resolved: row.coverage.resolved, executed: null,
        expectedPass: expected, passed: row.passed, exitCode: row.exitCode, signal: row.signal, timedOut: row.timedOut,
        changed: row.mutation.changed, hostStateChanged: row.mutation.hostStateChanged, unexpected: row.mutation.unexpected, runId: row.runId,
        artifactVerified: row.artifactVerified, verifierUntouched: row.verifierUntouched });
      console.error(JSON.stringify({ offlineCase: action, mode, preset, phase: 'checked' }));
    }
    const readyPath = path.join(sandbox, 'ready');
    const digest = 'a'.repeat(64), memoryFile = '.chimera/memory/long-term.json';
    const owned = { '.chimera/': 'directory', '.chimera/memory/': 'directory', [memoryFile]: digest };
    assert.equal(auditMutations({}, owned, true, true).allowed, true);
    for (const unsafe of [
      { ...owned, [memoryFile]: 'symlink:verify.cjs' },
      { ...owned, '.chimera/memory/': 'symlink:elsewhere' },
      { ...owned, [memoryFile]: undefined },
    ]) assert.equal(auditMutations(owned, unsafe, false, true).allowed, false);
    const hangPath = path.join(sandbox, 'hang.cjs');
    fs.writeFileSync(hangPath, `require('node:fs').writeFileSync(${JSON.stringify(readyPath)}, 'ready');setInterval(()=>{},1000);`);
    const hung = await execute([hangPath], sandbox, process.env, { timeoutMs: 1200, runId: 'hang-control' });
    assert.equal(fs.readFileSync(readyPath, 'utf8'), 'ready');
    assert.equal(hung.timedOut, true);
    assert.throws(() => process.kill(hung.pid, 0), error => error.code === 'ESRCH');
    console.log(JSON.stringify({ offline: true, liveApiCalls: 0, controlledCases: rows.length,
      accountingChecksPassed: true, timeoutReadyMarker: true, builtMemoryModule: fs.realpathSync(memoryModule), hostMemoryBoundaryChecks: true, provenance, rows,
      limitations: 'Controlled children only; no built CLI/provider execution or auto/native-preset proof. Snapshot boundaries are not isolation; .git metadata excluded. Tiny assertions are not semantic-quality metrics.' }, null, 2));
  } finally { fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
