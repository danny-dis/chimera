import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const script = workflow.match(/node -e '\r?\n([\s\S]*?)\r?\n\s*'\r?\n\s*env:/)?.[1];
assert(script, 'Missing release version synchronization script');
assert.match(workflow, /target_commitish: \$\{\{ github\.sha \}\}/);

const valid = ['0.0.0', '1.2.3', 'v1.2.3', '1.2.3-alpha', '1.2.3-alpha.1', '1.2.3-0', '1.2.3-01a', '1.2.3+001', '1.2.3-alpha.1+build.42'];
const invalid = ['', 'v', '1.2', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-alpha.01', '1.2.3-', '1.2.3+', '1.2.3-a..b', '1.2.3+build..1', ' 1.2.3', '1.2.3\n', 'vv1.2.3', '1.2.3;exit'];

for (const [versions, accepted] of [[valid, true], [invalid, false]]) {
  for (const version of versions) {
    const writes = new Map();
    const fs = {
      readdirSync: () => ['chimera-cli', 'chimera-core', 'unrelated'],
      readFileSync: () => '{"name":"fixture","version":"0.0.0"}',
      writeFileSync: (file, content) => writes.set(file, content),
      appendFileSync: (file, content) => writes.set(file, content),
    };
    const execute = () => runInNewContext(script, {
      require: name => { assert.equal(name, 'node:fs'); return fs; },
      process: { env: { VERSION: version, GITHUB_OUTPUT: 'output' } },
      console: { log() {} },
    }, { timeout: 1000 });
    if (accepted) {
      execute();
      const normalized = version.replace(/^v/, '');
      assert.equal(writes.size, 4);
      for (const file of ['package.json', 'packages/chimera-cli/package.json', 'packages/chimera-core/package.json']) {
        assert.equal(JSON.parse(writes.get(file)).version, normalized);
      }
      assert.equal(writes.get('output'), `version=${normalized}\n`);
    } else {
      assert.throws(execute, /Invalid release version/);
      assert.equal(writes.size, 0, 'Invalid version must not write any files');
    }
  }
}
console.log(JSON.stringify({ releaseWorkflow: true, validVersions: valid.length, invalidVersions: invalid.length, commitBinding: true }));
