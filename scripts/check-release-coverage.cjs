const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const feature = require('./live-repo-feature.cjs');
const { assessCoverage, assessFeature, snapshot } = feature;
const requested = { mode: 'code', preset: 'solo' };
const resolved = (mode = 'code', preset = 'solo') => ({ type: 'mode_preset_resolved', mode, preset });
const executed = (mode = 'code', preset = 'solo', changes = {}) => ({ type: 'deliberation_executed', mode, preset, resultMode: preset, degraded: false, ...changes });
const selected = preset => ({ type: 'auto_preset_selected', selectedPreset: preset });
const repair = { type: 'verification_repair_started', attempt: 1 };
const options = { release: true, coding: true };
assert.equal(typeof assessCoverage, 'function', 'Shared release handler coverage must exist');
const cases = [
  ['completed handler', requested, [resolved(), executed()], true],
  ['no events', requested, [], false],
  ['resolution only', requested, [resolved()], false],
  ['selection only', requested, [resolved('code', 'auto'), selected('solo')], false],
  ['degraded', requested, [resolved(), executed('code', 'solo', { degraded: true })], false],
  ['missing degraded flag', requested, [resolved(), executed('code', 'solo', { degraded: undefined })], false],
  ['wrong operational mode', requested, [resolved(), executed('debug')], false],
  ['missing operational mode', requested, [resolved(), executed(undefined, 'solo', { mode: undefined })], false],
  ['wrong handler preset', requested, [resolved(), executed('code', 'duo')], false],
  ['completion before resolution', requested, [executed(), resolved()], false],
  ['later degraded completion', requested, [resolved(), executed(), executed('code', 'solo', { degraded: true })], false],
  ['auto degraded root', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), executed('code', 'duo'), executed('code', 'auto', { degraded: true })], false],
  ['auto selection after leaf', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), executed('code', 'duo'), selected('duo'), executed('code', 'auto')], false],
  ['wrong result mode', requested, [resolved(), executed('code', 'solo', { resultMode: 'duo' })], false],
  ['wrong requested preset', requested, [resolved('code', 'duo'), executed('code', 'duo')], false],
  ['wrong requested mode', requested, [resolved('debug'), executed('debug')], false],
  ['stale completion', requested, [resolved(), executed(), repair, resolved()], false],
  ['stale resolution', requested, [resolved(), repair, executed()], false],
  ['new repair completion', requested, [resolved(), executed(), repair, resolved(), executed()], true],
  ['last resolution wins', requested, [resolved(), executed(), resolved('code', 'duo')], false],
  ['auto mapped resolution', { mode: 'auto', preset: 'auto' }, [resolved('code', 'solo'), selected('trio'), executed('code', 'trio'), executed('code', 'auto')], true],
  ['auto later unmatched selection', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), executed('code', 'duo'), selected('duo'), executed('code', 'auto')], false],
  ['explicit preset cannot run auto root', requested, [resolved(), selected('solo'), executed(), executed('code', 'auto')], false],
  ['auto leaf', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), executed('code', 'duo'), executed('code', 'auto')], true],
  ['auto without leaf', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), executed('code', 'auto')], false],
  ['auto without selection', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), executed('code', 'duo'), executed('code', 'auto')], false],
  ['auto wrong leaf', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), executed(), executed('code', 'auto')], false],
  ['auto stale selection', { mode: 'auto', preset: 'auto' }, [resolved('code', 'auto'), selected('duo'), repair, resolved('code', 'auto'), executed('code', 'duo'), executed('code', 'auto')], false],
  ['auto noncoding resolution', { mode: 'auto', preset: 'solo' }, [resolved('ask'), executed('ask')], false],
  ['swarm remap', { mode: 'code', preset: 'swarm' }, [resolved('code', 'trio'), executed('code', 'trio')], true],
  ['debug swarm remap', { mode: 'debug', preset: 'swarm' }, [resolved('debug', 'trio'), executed('debug', 'trio')], true],
  ['auto swarm remap', { mode: 'auto', preset: 'swarm' }, [resolved('code', 'trio'), executed('code', 'trio')], true],
  ['review is not remapped', { mode: 'review', preset: 'swarm' }, [resolved('review', 'trio'), executed('review', 'trio')], false],
];
for (const [name, request, events, expected] of cases) {
  const coverage = assessCoverage({ events }, request, options);
  assert.equal(coverage.passed, expected, name);
  if (request.preset === 'swarm') assert.equal(coverage.nativePresetProven, false, name);
  if (name === 'auto leaf') {
    assert.deepEqual(coverage.executed, { mode: 'code', preset: 'duo' });
    assert.equal(coverage.autoCodingProven, true);
  }
}
for (const mode of ['ask', 'plan', 'review']) {
  assert.equal(assessCoverage({ events: [resolved(mode), executed(mode)] }, { mode, preset: 'solo' }, { release: true }).passed, true);
  assert.equal(assessCoverage({ events: [resolved(mode)] }, { mode, preset: 'solo' }, { release: true }).passed, false);
}
const legacy = assessCoverage({ events: [resolved()] }, requested);
assert.equal(legacy.executed, null);
assert.equal(legacy.nativePresetProven, false);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-release-check-'));
try {
  fs.writeFileSync(path.join(root, 'calc.js'), 'old');
  fs.writeFileSync(path.join(root, 'mathops.js'), 'old');
  fs.writeFileSync(path.join(root, 'verify.cjs'), 'process.stdout.write(JSON.stringify({runId:"offline-release",verified:true}));');
  const fixture = { before: snapshot(root), runId: 'offline-release', seedFailed: true };
  fs.writeFileSync(path.join(root, 'calc.js'), 'new');
  fs.writeFileSync(path.join(root, 'mathops.js'), 'new');
  const result = { code: 0, signal: null, timedOut: false, runId: fixture.runId };
  const parsed = { status: 'done', verification: { verified: true }, events: [resolved(), executed()] };
  assert.equal(assessFeature(root, fixture, result, parsed, requested, { release: true }).passed, true);
  assert.equal(assessFeature(root, fixture, result, { ...parsed, events: [resolved()] }, requested, { release: true }).passed, false);
  assert.equal(assessFeature(root, fixture, result, { ...parsed, events: [resolved()] }, requested).passed, true);
  for (const changes of [{ code: 7 }, { signal: 'SIGTERM' }, { timedOut: true }, { runId: 'stale' }]) {
    assert.equal(assessFeature(root, fixture, { ...result, ...changes }, parsed, requested, { release: true }).passed, false);
  }
  const driver = fs.readFileSync(path.join(__dirname, 'test-live-mode-presets.cjs'), 'utf8');
  const readOnlyBlock = driver.slice(driver.indexOf('      if (release && !coding) {'), driver.indexOf('      row.logFile ='));
  assert.ok(readOnlyBlock.includes('feature.assessCoverage'), 'Read-only release rows must use shared coverage');
  const before = snapshot(root);
  const readOnly = (changes = {}) => vm.runInNewContext(readOnlyBlock + '\nrow', {
    release: true, coding: false, feature, before, root, mode: 'ask', preset: 'solo',
    childRunId: fixture.runId, result, row: { passed: true },
    parsed: { events: [resolved('ask'), executed('ask')] }, ...changes,
  });
  assert.equal(readOnly().passed, true);
  assert.equal(readOnly({ parsed: { events: [resolved('ask')] } }).passed, false);
  assert.equal(readOnly({ result: { ...result, signal: 'SIGTERM' } }).passed, false);
  assert.equal(readOnly({ result: { ...result, runId: 'stale' } }).passed, false);
  assert.equal(readOnly({ row: { passed: false } }).passed, false, 'Task rubric and child exit remain authoritative');
  fs.mkdirSync(path.join(root, '.chimera/memory'), { recursive: true });
  fs.writeFileSync(path.join(root, '.chimera/memory/long-term.json'), '{}');
  assert.equal(readOnly().passed, true, 'Exact existing host-memory exception');
  fs.writeFileSync(path.join(root, '__proto__'), 'unexpected');
  assert.equal(readOnly().passed, false, 'Read-only rejects unexpected paths');
  assert.equal(assessFeature(root, fixture, result, parsed, requested, { release: true }).passed, false);
} finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
console.log(JSON.stringify({ offline: true, liveApiCalls: 0, coverageCases: cases.length, featureReleaseGate: 'passed', readOnlyReleaseGate: 'passed', legacyOptionalTelemetry: 'passed' }));
