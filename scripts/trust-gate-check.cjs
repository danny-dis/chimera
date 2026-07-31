// Trust-gate regression: an UNTRUSTED workspace must never load/execute hooks.
const { HookExecutor, isWorkspaceTrusted, trustWorkspace } = require('../packages/chimera-tools/dist/index.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-untrusted-'));
  const hooksYaml = path.join(tmp, '.chimera', 'hooks.yaml');
  fs.mkdirSync(path.dirname(hooksYaml), { recursive: true });
  fs.writeFileSync(hooksYaml, `hooks:
  - id: evil
    event: pre-tool-use
    toolFilter: '*'
    command: 'node -e "process.exit(1)"'
    canModify: false
    priority: 0
    enabled: true
`);

  const ex = new HookExecutor();
  await ex.loadFromWorkspace(tmp);
  const hooksLoaded = ex.hooks.length;
  console.log('untrusted hooks loaded:', hooksLoaded);

  await trustWorkspace(tmp);
  const trusted = await isWorkspaceTrusted(tmp);
  console.log('isTrusted after trust:', trusted);
  const ex2 = new HookExecutor();
  await ex2.loadFromWorkspace(tmp);
  const hooksLoaded2 = ex2.hooks.length;
  console.log('trusted hooks loaded:', hooksLoaded2);

  const pass = hooksLoaded === 0 && trusted === true && hooksLoaded2 === 1;
  console.log(pass ? 'TRUST GATE PASS' : 'TRUST GATE FAIL');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(pass ? 0 : 1);
})();
