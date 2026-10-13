const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'smoke-test.js'), 'utf8');
for (const output of ['MockProvider', 'offline', 'No API keys']) {
  let exitCode;
  const logs = [];
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'child_process') return { execSync() { throw Object.assign(new Error('execution failed'), { stdout: output, stderr: '', status: 1 }); } };
      if (name === 'fs') return { rmSync() {}, mkdirSync() {}, existsSync() { return false; } };
      throw new Error(`Unexpected import: ${name}`);
    },
    process: { argv: ['node', 'smoke-test.js', '--mode', 'ask', '--preset', 'solo'], env: {}, exit(code) { exitCode = code; } },
    console: { log(...args) { logs.push(args.join(' ')); } },
  });
  assert.equal(exitCode, 1, `failed child mentioning ${output} must fail smoke acceptance`);
  assert.ok(logs.some(line => line.includes('0 passed, 1 failed')), `missing failure accounting for ${output}`);
}
console.log(JSON.stringify({ failedOfflineExecutionsRejected: true, cases: 3 }));
