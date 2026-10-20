const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const task = 'Read input.txt, then create result.js exporting the number 42 as CommonJS. Never change input.txt or verify.cjs. Run node verify.cjs.';
const verifier = "require('node:assert/strict').equal(require('./result.js'),42);\n";
const input = 'padding-'.repeat(100) + 'RESTART_INPUT_42';
const response = (content, toolCalls) => ({ content, ...(toolCalls ? { toolCalls } : {}), usage: { inputTokens: 1, outputTokens: 1 }, finishReason: toolCalls?.length ? 'tool_use' : 'stop' });
async function child(phase) {
  const { CliRouter } = require(path.join(repo, 'packages/chimera-cli/dist/cli-router.js'));
  const { MockProvider } = require(path.join(repo, 'packages/chimera-providers/dist/index.js'));
  const { CheckpointStore } = require(path.join(repo, 'packages/chimera-session/dist/index.js'));
  const { adaptProvider } = require(path.join(repo, 'packages/chimera-cli/dist/provider-adapter.js'));
  const router = new CliRouter();
  const store = new CheckpointStore();
  const provider = new MockProvider({ model: 'controlled-restart' });
  let context, calls = 0;
  provider.complete = async (messages, options) => {
    fs.appendFileSync('calls.jsonl', JSON.stringify({ phase, tools: !!options?.tools?.length, inputRetained: messages.some(message => String(message.content).includes('RESTART_INPUT_42')) }) + '\n');
    if (!options?.tools?.length) return response(JSON.stringify({ verdict: 'PASS', confidence: 0.99, issues: [], commentary: 'Controlled restart acceptance.' }));
    if (phase === 'seed') {
      if (++calls === 1) return response('', [{ id: 'read-input', name: 'read_file', arguments: JSON.stringify({ path: 'input.txt' }) }]);
      await store.save(context.orchestrator.exportState('restart', task, 'code'));
      process.exit(71);
    }
    if (!fs.existsSync('result.js')) return response('', [{ id: 'write-result', name: 'write_file', arguments: JSON.stringify({ path: 'result.js', content: 'module.exports=42;\n' }) }]);
    return response('Implementation written; caller verification can execute it.');
  };
  router.getRoleMappedProviders = async () => ({ writer: provider, reviewer: provider, fallback: [provider] });
  router.noLearn = true;
  if (phase === 'seed') {
    router.initializeRuntime();
    context = await router.buildRunContext('code', { yolo: true, interactive: false });
    await context.orchestrator.execute({ task, mode: 'code', preset: 'solo', providers: { writer: adaptProvider(provider), reviewer: adaptProvider(provider) }, verificationCommands: ['node verify.cjs'], verificationInputs: ['verify.cjs'], timeoutMs: 120000, maxToolRounds: 6 });
    throw new Error('Seed must exit immediately after its saved checkpoint');
  }
  await router.runCli(['node', 'chimera', '--no-learn', ...(process.argv.includes('--approve') ? ['--yolo'] : []), 'resume', 'restart']);
}
function run(phase, root, approve = false) {
  const result = spawnSync(process.execPath, [__filename, '--child', phase, ...(approve ? ['--approve'] : [])], { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
  fs.writeFileSync(path.join(root, `${phase}.log`), result.stdout + '\n' + result.stderr);
  assert.equal(result.signal, null, `${phase}: ${result.error?.message ?? result.stderr}`);
  assert.equal(result.error, undefined, `${phase}: ${result.error?.message}`);
  return result;
}
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-restart-'));
  console.log(JSON.stringify({ controlled: true, evidenceRoot: root, ceiling: 'Explicit checkpoint then abrupt exit; not automatic mid-turn crash recovery or multi-day endurance.' }));
  for (const scenario of ['intact', 'without-approval', 'tampered-verifier', 'expired-deadline']) {
    const workspace = path.join(root, scenario); fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'input.txt'), input);
    fs.writeFileSync(path.join(workspace, 'verify.cjs'), verifier);
    const seed = run('seed', workspace); assert.equal(seed.status, 71, seed.stderr);
    const file = path.join(workspace, '.chimera/sessions/restart.json');
    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(before.verificationContract.inputs['verify.cjs'], digest(verifier));
    assert.ok(before.toolCallHistory.some(observation => observation.toolName === 'read_file'
      && JSON.stringify(observation.result).includes('RESTART_INPUT_42')), 'checkpoint must retain the completed read');
    if (scenario === 'tampered-verifier') fs.writeFileSync(path.join(workspace, 'verify.cjs'), 'process.exit(0);\n');
    if (scenario === 'expired-deadline') { before.taskBudget.deadlineMs = Date.now() - 1; fs.writeFileSync(file, JSON.stringify(before)); }
    const countBefore = fs.readFileSync(path.join(workspace, 'calls.jsonl'), 'utf8').trim().split('\n').length;
    const resumed = run('resume', workspace, scenario !== 'without-approval');
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(after.taskBudget.deadlineMs, before.taskBudget.deadlineMs, 'resume must not renew the deadline');
    assert.deepEqual(after.verificationContract.inputs, before.verificationContract.inputs);
    if (scenario === 'intact') {
      assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
      assert.equal(after.metadata.status, 'completed');
      assert.equal(fs.readFileSync(path.join(workspace, 'verify.cjs'), 'utf8'), verifier);
      const checked = spawnSync(process.execPath, ['verify.cjs'], { cwd: workspace, timeout: 5000 });
      assert.equal(checked.status, 0); assert.equal(checked.error, undefined);
      const replay = run('resume', workspace, true); assert.equal(replay.status, 0); assert.match(replay.stdout, /already completed/);
      const observed = fs.readFileSync(path.join(workspace, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
      assert.ok(observed.some(call => call.phase === 'resume' && call.tools));
      assert.ok(observed.filter(call => call.phase === 'resume' && call.tools).every(call => call.inputRetained), 'resume must retain observed input');
    } else if (scenario === 'without-approval') {
      assert.equal(resumed.status, 1); assert.match(resumed.stdout, /Verification failed or was denied/);
      assert.ok(after.toolCallHistory.some(observation => observation.toolName === 'run_shell_command' && observation.result.success === false));
      assert.notEqual(after.metadata.status, 'completed');
    } else {
      assert.equal(resumed.status, 1, resumed.stdout + resumed.stderr);
      assert.equal(fs.existsSync(path.join(workspace, 'result.js')), false);
      assert.equal(fs.readFileSync(path.join(workspace, 'calls.jsonl'), 'utf8').trim().split('\n').length, countBefore);
    }
    assert.equal(fs.readFileSync(path.join(workspace, 'input.txt'), 'utf8'), input);
    console.log(JSON.stringify({ controlled: true, scenario, passed: true, seedExit: seed.status, resumeExit: resumed.status, originalContractRetained: true }));
  }
}
(process.argv[2] === '--child' ? child(process.argv[3]) : main()).catch(error => { console.error(error); process.exitCode = 1; });
