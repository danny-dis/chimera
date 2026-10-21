const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '..');
const req = createRequire(path.join(repo, 'packages/chimera-cli/package.json'));
const modes = { ask: ['solo'], plan: ['solo', 'duo'], code: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'], debug: ['auto', 'solo', 'duo', 'trio', 'fusion', 'swarm'], review: ['auto', 'duo', 'trio', 'fusion', 'swarm'], oal: ['solo'], auto: ['auto', 'solo', 'duo', 'trio', 'fusion', 'hive', 'swarm'] };
const combos = Object.entries(modes).flatMap(([mode, presets]) => presets.map(preset => ({ mode, preset })));
assert.equal(combos.length, 29);
assert.equal(new Set(combos.map(row => `${row.mode}/${row.preset}`)).size, 29);
function assertSourceCombos(source, rows = combos) {
  const block = source.match(/const VALID_MODE_PRESET_COMBOS\b[^=]*=\s*(\{[\s\S]*?\n\});/);
  assert.ok(block, 'Cannot read authoritative mode/preset combinations');
  const modes = JSON.parse(block[1].replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/,\s*}/g, '}'));
  const expected = Object.entries(modes).flatMap(([mode, presets]) => presets.map(preset => `${mode}/${preset}`)).sort();
  assert.deepEqual(rows.map(row => `${row.mode}/${row.preset}`).sort(), expected, 'Acceptance mode/preset combinations drifted from source');
}
function hasUsefulPlan(output) {
  if (typeof output !== 'string' || output.trim().length <= 30) return false;
  if (/^\s*(?:\[chimera\]\s*)?(?:both models failed\b|empty response\b|(?:error|failure|failed)\s*:)/im.test(output)) return false;
  // ponytail: prompt-specific content heuristic, use a task rubric when planning cases expand.
  return /\b(?:create|write|implement|add|build)\b/i.test(output) && /\bhello\b/i.test(output)
    && /\b(?:node|npm|pnpm|npx)\s+[\w./-]+/i.test(output) && /\b(?:verify|verification|test|check|assert|expect|confirm)\b/i.test(output);
}
assertSourceCombos(fs.readFileSync(path.join(repo, 'packages/chimera-core/src/session-orchestrator.ts'), 'utf8'));
module.exports = { assertSourceCombos, hasUsefulPlan, execute };
if (require.main === module && process.argv.includes('--list')) { console.log(JSON.stringify(combos)); process.exit(0); }
const destination = path.resolve(process.env.CHIMERA_ACCEPTANCE_DIR || path.join(os.tmpdir(), 'chimera-live-mode-presets'));
if (require.main === module) fs.mkdirSync(destination, { recursive: true });
const secrets = [];
const redact = text => secrets.reduce((value, secret) => value.split(secret).join('[REDACTED]'), String(text));
function execute(args, cwd, env, { timeoutMs = 180000, runId = null } = {}) {
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, 'Positive finite timeout required');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') {
        try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 2000 }); } catch { child.kill(); }
      } else child.kill();
    }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, timedOut, runId, pid: child.pid }); });
  });
}
if (require.main === module) (async () => {
  const release = process.argv.includes('--release');
  const feature = release || process.argv.includes('--repo-feature') ? require('./live-repo-feature.cjs') : null;
  const rows = [], selected = combos.filter(row => !process.env.COMBO || `${row.mode}/${row.preset}` === process.env.COMBO);
  const reportFile = path.join(destination, release ? 'release-results.json' : feature ? 'repo-feature-results.json' : 'results.json');
  const runId = require('node:crypto').randomUUID();
  const persist = (error) => fs.writeFileSync(reportFile, JSON.stringify({ runId, complete: !error && rows.length === selected.length && selected.length > 0,
    expected: selected.length, passed: !error && rows.length === selected.length && rows.length > 0 && rows.every(item => item.passed),
    ...(error ? { error: redact(`${error.name}: ${error.message}`) } : {}), rows }, null, 2));
  persist();
  try {
  assert.ok(selected.length, 'Unknown mode/preset');
  if (feature && !release) assert.ok(process.env.COMBO && selected.every(row => ['code', 'auto'].includes(row.mode)), '--repo-feature requires one code/* or auto/* COMBO');
  req('dotenv').config({ path: path.join(repo, '.env'), quiet: true });
  const loader = req('./dist/config-loader.js');
  const roles = loader.getProvidersByRole(loader.loadConfig(repo));
  for (const role of ['writer', 'reviewer', 'challenger']) assert.ok(roles[role] && roles[role].provider !== 'mock', `Real ${role} required`);
  const env = { ...process.env, CHIMERA_EXECUTE_TIMEOUT_MS: '120000', NO_COLOR: '1' };
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH ?? env.Path ?? ''); env.Path = env.PATH;
  const providers = ['writer', 'reviewer', 'challenger'].map(role => {
    const entry = roles[role], key = `CHIMERA_ACCEPT_${role.toUpperCase()}_KEY`, url = `CHIMERA_ACCEPT_${role.toUpperCase()}_URL`;
    env[key] = entry.apiKey ?? entry.api_key ?? ''; env[url] = entry.baseUrl ?? entry.base_url ?? '';
    for (const value of [env[key], env[url]]) if (value.length > 3) secrets.push(value);
    return { name: `accept-${role}`, role, provider: entry.provider, model: entry.model, api_key: '${' + key + '}', ...(env[url] ? { base_url: '${' + url + '}' } : {}), timeout_ms: 45000 };
  });
  for (const { mode, preset } of selected) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-mode-'));
    const verifier = "const a=require('node:assert/strict'),{add}=require('./sum.js');a.equal(add(2,3),5);a.equal(add(-2,3),1);a.equal(add(0,0),0);a.equal(add(12,-5),7);";
    const coding = (feature && !release) || ['code', 'debug', 'oal'].includes(mode) || (release && mode === 'auto');
    let fixture;
    let row = {
      mode, preset, passed: false,
    };
    try {
      execFileSync('git', ['init', root], { stdio: 'ignore' });
      fs.mkdirSync(path.join(root, '.chimera'));
      fs.writeFileSync(path.join(root, '.chimera/config.yaml'), JSON.stringify({ providers, defaults: { preset } }));
      fs.writeFileSync(path.join(root, 'verify.cjs'), verifier);
      if (feature && coding) fixture = await feature.prepareFeature(root);
      if (mode === 'debug' && !fixture) fs.writeFileSync(path.join(root, 'sum.js'), 'exports.add=(a,b)=>a-b;\n');
      const before = release && !coding ? feature.snapshot(root) : null;
      const childRunId = fixture?.runId ?? (release ? require('node:crypto').randomUUID() : null);
      let seedFailed = false;
      if (coding) { try { execFileSync(process.execPath, ['verify.cjs'], { cwd: root, stdio: 'pipe', timeout: 5000, killSignal: 'SIGKILL' }); } catch (error) { seedFailed = error.status === 1 && !error.signal && !error.code; } }
      const task = fixture?.prompt ?? (mode === 'debug' ? 'Fix sum.js: add(a,b) must add numbers, not subtract them. Edit the implementation; never modify verify.cjs.' : coding ? 'Create sum.js as a CommonJS module exporting add(a,b) that adds numbers. Use write_file. Never modify verify.cjs.' : mode === 'plan' ? 'Plan a Node.js CLI that prints hello; explain implementation and verification. Do not edit any files.' : mode === 'review' ? 'Review this code for bugs: function divide(a,b){return a*b;}. Identify the wrong arithmetic. Do not edit any files.' : 'Reply with exactly the single word: PONG');
      const options = { preset, json: true, yolo: true, verifyInput: ['verify.cjs'] };
      // auto has no public one-shot command; exercise the same built CLI host run seam.
      const autoDriver = `const {CliRouter}=require(${JSON.stringify(path.join(repo, 'packages/chimera-cli/dist/cli-router.js'))});const r=new CliRouter();r.noLearn=true;r.initializeRuntime();r.run('auto',${JSON.stringify(task)},${JSON.stringify(preset)},${JSON.stringify(fixture ? ['node verify.cjs'] : [])},${JSON.stringify(options)}).catch(e=>{console.error(e);process.exitCode=1});`;
      const args = mode === 'auto' ? ['-e', autoDriver] : [path.join(repo, 'packages/chimera-cli/dist/index.js'), '--no-learn', mode, task, '--preset', preset, '--json', '--yolo', ...(coding ? ['--verify', 'node verify.cjs', '--verify-input', 'verify.cjs'] : [])];
      const started = Date.now(), result = await execute(args, root, env, { runId: childRunId });
      let parsed; try { parsed = JSON.parse(result.stdout.trim()); } catch {}
      const verifierBefore = fs.existsSync(path.join(root, 'verify.cjs')) && fs.readFileSync(path.join(root, 'verify.cjs'), 'utf8') === (fixture?.verifier ?? verifier);
      let artifactVerified = false;
      if (coding && !fixture && verifierBefore) { try { execFileSync(process.execPath, ['verify.cjs'], { cwd: root, stdio: 'pipe', timeout: 5000, killSignal: 'SIGKILL' }); artifactVerified = true; } catch {} }
      const verifierUntouched = verifierBefore && fs.existsSync(path.join(root, 'verify.cjs')) && fs.readFileSync(path.join(root, 'verify.cjs'), 'utf8') === (fixture?.verifier ?? verifier);
      const contentVerified = coding ? artifactVerified && parsed?.verification?.verified === true : mode === 'ask' || mode === 'auto' ? /PONG/.test(parsed?.output ?? '') : mode === 'review' ? /multip|divid|division|\*/i.test(parsed?.output ?? '') : hasUsefulPlan(parsed?.output);
      row = { mode, preset, surface: mode === 'auto' ? 'built-cli-host' : 'public-cli', exitCode: result.code, timedOut: result.timedOut, elapsedMs: Date.now() - started, status: parsed?.status, seedFailed: coding ? seedFailed : undefined, artifactVerified: coding ? artifactVerified : undefined, verifierUntouched, contentVerified, passed: result.code === 0 && !result.timedOut && parsed?.status === 'done' && contentVerified && verifierUntouched && (!coding || seedFailed) };
      if (fixture) {
        const acceptance = feature.assessFeature(root, fixture, result, parsed, { mode, preset }, { release });
        row = { ...row, ...acceptance, contentVerified: acceptance.artifactVerified && parsed?.verification?.verified === true };
      }
      if (release && !coding) {
        const mutation = feature.auditMutations(before, feature.snapshot(root), true, true);
        const coverage = feature.assessCoverage(parsed, { mode, preset }, { release });
        const identityMatches = result.runId === childRunId;
        row = { ...row, runId: childRunId, identityMatches, signal: result.signal, mutation, coverage,
          passed: row.passed && result.signal === null && identityMatches && mutation.allowed && coverage.passed };
      }
      row.logFile = `${mode}-${preset}${fixture ? '-' + fixture.runId : ''}.log`;
      fs.writeFileSync(path.join(destination, row.logFile), redact((fixture ? JSON.stringify({ runId: fixture.runId, provenance: fixture.provenance }) + '\n' : '') + result.stdout + '\n' + result.stderr));
    } catch (error) { row = { ...row, passed: false, error: redact(`${error.name}: ${error.message}`) }; }
    finally {
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
      catch (error) { row = { ...row, passed: false, cleanupError: redact(`${error.name}: ${error.message}`) }; }
    }
    rows.push(row); persist(); console.log(JSON.stringify(row));
  }
  process.exitCode = rows.every(row => row.passed) ? 0 : 1;
  } catch (error) { persist(error); throw error; }
})().catch(error => { console.error(redact(`${error.name}: ${error.message}`)); process.exitCode = 1; });
