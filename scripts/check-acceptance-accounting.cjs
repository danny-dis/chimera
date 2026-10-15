const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const driver = path.resolve(__dirname, 'test-live-mode-presets.cjs');
const text = fs.readFileSync(driver, 'utf8');
async function check(fault) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-acceptance-accounting-'));
  const report = path.join(root, 'results.json');
  const mod = { exports: {} };
  const proc = { ...process, argv: [process.execPath, driver], env: { ...process.env, COMBO: 'ask/solo', CHIMERA_ACCEPTANCE_DIR: root }, exitCode: 0 };
  fs.writeFileSync(report, JSON.stringify({ complete: true, passed: true, rows: [{ passed: true, stale: true }] }));
  let spawnError;
  const fakeRequire = name => {
    if (name === 'node:module') return { createRequire: () => name => {
      if (name === 'dotenv') return { config() {} };
      if (name === './dist/config-loader.js') return {
        loadConfig() { if (fault === 'config') throw new Error('CONTROLLED_CONFIG_FAILURE'); return {}; },
        getProvidersByRole: () => Object.fromEntries(['writer', 'reviewer', 'challenger'].map(role => [role, { provider: 'openai-compatible', model: 'controlled' }])),
      };
      throw new Error('Unexpected fixture dependency: ' + name);
    } };
    if (name === 'node:child_process') return {
      ...require(name),
      spawn: () => {
        const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
        queueMicrotask(() => {
          if (fault === 'spawn') { spawnError = new Error('CONTROLLED_SPAWN_FAILURE'); child.emit('error', spawnError); }
          else { child.stdout.emit('data', JSON.stringify({ status: 'done', output: 'PONG' })); child.emit('close', 0, null); }
        });
        return child;
      },
    };
    if (name === 'node:fs' && fault === 'cleanup') return { ...fs, rmSync(target, options) {
      if (String(target).includes('chimera-mode-')) { fs.rmSync(target, options); throw new Error('CONTROLLED_CLEANUP_FAILURE'); }
      return fs.rmSync(target, options);
    } };
    return require(name);
  };
  fakeRequire.main = mod;
  try {
    await vm.runInNewContext(text, { require: fakeRequire, module: mod, __dirname: path.dirname(driver), process: proc,
      console: { log() {}, error() {} }, setTimeout, clearTimeout, Buffer });
    const observed = JSON.parse(fs.readFileSync(report, 'utf8'));
    assert.equal(observed.passed, false, `${fault} must not leave a stale passing report`);
    assert.ok(!observed.rows.some(row => row.stale), 'Current run replaces stale rows');
    assert.equal(proc.exitCode, 1);
    if (fault === 'config') { assert.equal(observed.complete, false); assert.match(observed.error, /CONTROLLED_CONFIG_FAILURE/); }
    else {
      assert.equal(observed.complete, true); assert.equal(observed.rows.length, 1); assert.equal(observed.rows[0].passed, false);
      assert.match(observed.rows[0].error || observed.rows[0].cleanupError, /CONTROLLED_(?:SPAWN|CLEANUP)_FAILURE/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
}
function checkVerifierTimeout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-verifier-timeout-'));
  const verifier = 'setInterval(() => {}, 1000);';
  const block = text.slice(text.indexOf('      const verifierBefore ='), text.indexOf('      const contentVerified ='));
  assert.match(block, /timeout:\s*5000/, 'Do not run an unbounded verifier probe');
  try {
    fs.writeFileSync(path.join(root, 'verify.cjs'), verifier);
    const started = Date.now();
    const result = vm.runInNewContext(block + '\n({artifactVerified,verifierUntouched})', {
      fs, path, root, verifier, coding: true, fixture: undefined, process, execFileSync,
    });
    assert.equal(result.artifactVerified, false, 'A hanging verifier must not pass');
    assert.equal(result.verifierUntouched, true);
    assert.ok(Date.now() - started < 8000, 'Verifier must settle at its own deadline');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
}
(async () => {
  for (const fault of ['config', 'spawn', 'cleanup']) await check(fault);
  checkVerifierTimeout();
  console.log(JSON.stringify({ controlled: true, staleSuccessRejected: true, verifierTimeoutRejected: true, recordedFailures: ['config', 'spawn', 'cleanup'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
