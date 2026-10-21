import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '');
const script = workflow.match(/node -e '\n([\s\S]*?)\n\s*'\n\s*env:/)?.[1];
assert(script, 'Missing release version synchronization script');
assert.match(workflow, /target_commitish: \$\{\{ github\.sha \}\}/);
assert(workflow.indexOf('- name: Validate release version') < workflow.indexOf('- name: Build all packages'), 'Version validation must precede compilation');
assert.match(workflow, /fail_on_unmatched_files: true/);
assert.match(workflow, /files:\s*\|\s*\n\s*release-artifacts\/\*-runtime\.tar\.gz\s*\n\s*release-artifacts\/SHA256SUMS/);
assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.publish_npm/);
assert(workflow.indexOf('- name: Create GitHub Release') < workflow.indexOf('- name: Publish runtime packages to npm'), 'Downloads must not depend on npm publication');

const pinIndex = workflow.indexOf('- name: Pin release tag');
assert(pinIndex > workflow.indexOf('- name: Clean package consumer smoke'), 'Tag pin must follow package smoke');
assert(pinIndex < workflow.indexOf('- name: Create GitHub Release'), 'Tag pin must precede publication');
assert.match(workflow, /CHIMERA_RELEASE_DIR:[^\n]+\n\s*\n\s*- name: Pin release tag/);
assert.match(workflow, /VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n\s*\n\s*- name: Create GitHub Release/);
const pinScript = workflow.match(/- name: Pin release tag\n\s*run: \|\n\s*node -e '([^'\n]+)'/)?.[1];
assert(pinScript, 'Missing atomic release tag pin');
const tagSource = readFileSync(new URL('./release-tag.cjs', import.meta.url), 'utf8');
function loadTag(execFileSync) {
  const module = { exports: {} };
  runInNewContext(tagSource, { module, require(name) {
    assert.equal(name, 'node:child_process');
    return { execFileSync };
  } });
  return module.exports;
}
function pin(version, sha, execute) {
  runInNewContext(pinScript, {
    require(name) { assert.equal(name, './scripts/release-tag.cjs'); return loadTag(execute); },
    process: { env: { VERSION: version, GITHUB_SHA: sha } },
  });
}

const valid = ['0.0.0', '1.2.3', 'v1.2.3', '1.2.3-alpha', '1.2.3-alpha.1', '1.2.3-0', '1.2.3-01a', '1.2.3+001', '1.2.3-alpha.1+build.42'];
const invalid = ['', 'v', '1.2', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-alpha.01', '1.2.3-', '1.2.3+', '1.2.3-a..b', '1.2.3+build..1', ' 1.2.3', '1.2.3\n', 'vv1.2.3', '1.2.3;exit'];

for (const [versions, accepted] of [[valid, true], [invalid, false]]) {
  for (const version of versions) {
    const writes = new Map();
    const fs = {
      readdirSync: () => ['chimera-cli', 'chimera-core', 'unrelated'],
      readFileSync: () => JSON.stringify({ name: 'fixture', version: version.replace(/^v/, '') }),
      writeFileSync: (file, content) => writes.set(file, content),
      appendFileSync: (file, content) => writes.set(file, content),
    };
    const execute = () => runInNewContext(script, {
      require: name => { if (name === 'node:fs') return fs; assert.equal(name, './scripts/release-tag.cjs'); return loadTag(() => { throw Object.assign(new Error('tag absent'), { status: 2 }); }); },
      process: { env: { VERSION: version, GITHUB_SHA: 'a'.repeat(40), GITHUB_OUTPUT: 'output' } },
      console: { log() {} },
    }, { timeout: 1000 });
    if (accepted) {
      execute();
      const normalized = version.replace(/^v/, '');
      assert.equal(writes.size, 1, 'Release must not rewrite committed manifests');
      assert.equal(writes.get('output'), `version=${normalized}\n`);
    } else {
      assert.throws(execute, /Invalid release version/);
      assert.equal(writes.size, 0, 'Invalid version must not write any files');
    }
  }
}
let writes = 0;
assert.throws(() => runInNewContext(script, {
  require: () => ({ readdirSync: () => ['chimera-cli'], readFileSync: () => '{"version":"0.5.7"}', writeFileSync() { writes++; }, appendFileSync() { writes++; } }),
  process: { env: { VERSION: 'v0.6.0', GITHUB_OUTPUT: 'output' } }, console: { log() {} },
}), /Release version must match committed manifests/);
assert.equal(writes, 0);
const sha = 'a'.repeat(40), other = 'b'.repeat(40);
const tagCases = [
  ['missing tag', null, true],
  ['matching lightweight tag', `${sha}\trefs/tags/v0.6.0\n`, true],
  ['mismatched lightweight tag', `${other}\trefs/tags/v0.6.0\n`, false],
  ['matching annotated tag', `${other}\trefs/tags/v0.6.0\n${sha}\trefs/tags/v0.6.0^{}\n`, true],
  ['mismatched annotated tag', `${sha}\trefs/tags/v0.6.0\n${other}\trefs/tags/v0.6.0^{}\n`, false],
  ['network failure', 'network-error', false],
];
for (const [name, remote, accepted] of tagCases) {
  const writes = new Map();
  const execute = () => runInNewContext(script, {
    require(module) {
      if (module === 'node:fs') return {
        readdirSync: () => ['chimera-cli'], readFileSync: () => '{"version":"0.6.0"}',
        writeFileSync() { throw new Error('Manifests are immutable'); },
        appendFileSync: (file, data) => writes.set(file, data),
      };
      assert.equal(module, './scripts/release-tag.cjs');
      return loadTag((command, args) => {
        assert.equal(command, 'git');
        assert.deepEqual(Array.from(args), ['ls-remote', '--exit-code', '--tags', 'origin', 'refs/tags/v0.6.0', 'refs/tags/v0.6.0^{}']);
        if (remote === null || remote === 'network-error') throw Object.assign(new Error('remote unavailable'), { status: remote === null ? 2 : 128 });
        return remote;
      });
    },
    process: { env: { VERSION: 'v0.6.0', GITHUB_SHA: sha, GITHUB_OUTPUT: 'output' } },
    console: { log() {} },
  });
  if (accepted) { execute(); assert.equal(writes.get('output'), 'version=0.6.0\n', name); }
  else { assert.throws(execute, undefined, name); assert.equal(writes.size, 0, name); }
}
const ref = 'refs/tags/v0.6.0';
const exact = `${sha}\t${ref}\n`;
const annotated = `${other}\t${ref}\n${sha}\t${ref}^{}\n`;
const pinCases = [
  ['new lightweight tag', exact, false, true],
  ['matching lightweight after rejection', exact, true, true],
  ['matching annotated after rejection', annotated, true, true],
  ['matching annotated after success', annotated, false, true],
  ['conflicting lightweight after success', `${other}\t${ref}\n`, false, false],
  ['conflicting annotated', `${sha}\t${ref}\n${other}\t${ref}^{}\n`, true, false],
  ['missing after success', 2, false, false],
  ['read failure after success', 128, false, false],
  ['missing after rejection', 2, true, false],
  ['read failure after rejection', 128, true, false],
  ['empty after success', '', false, false],
  ['malformed SHA', `bad\t${ref}\n`, false, false],
  ['wrong ref', `${sha}\trefs/tags/v0.6.00\n`, false, false],
  ['peeled only', `${sha}\t${ref}^{}\n`, false, false],
  ['duplicate exact', exact + exact, false, false],
  ['extra column', `${sha}\t${ref} extra\n`, false, false],
];
for (const [name, remote, pushFails, accepted] of pinCases) {
  const calls = [];
  const execute = (command, args, options) => {
    assert.equal(command, 'git');
    assert.equal(options.timeout, 30000);
    calls.push(args[0]);
    if (args[0] === 'push') {
      assert.deepEqual(Array.from(args), ['push', 'origin', `${sha}:${ref}`], 'Only a non-force, explicit single-ref pin is allowed');
      if (pushFails) throw new Error('Push rejected or acknowledgement lost');
      return '';
    }
    assert.deepEqual(Array.from(args), ['ls-remote', '--exit-code', '--tags', 'origin', ref, `${ref}^{}`]);
    if (typeof remote === 'number') throw Object.assign(new Error('remote unavailable'), { status: remote });
    return remote;
  };
  if (accepted) pin('0.6.0', sha, execute);
  else assert.throws(() => pin('0.6.0', sha, execute), undefined, name);
  assert.deepEqual(calls, ['push', 'ls-remote'], `${name}: verification is mandatory even after push success/failure`);
}
let remoteSha;
const producer = (builtSha) => (command, args) => {
  assert.equal(command, 'git');
  if (args[0] === 'push') {
    assert.deepEqual(Array.from(args), ['push', 'origin', `${builtSha}:${ref}`]);
    if (remoteSha && remoteSha !== builtSha) throw new Error('tag already exists');
    remoteSha = builtSha;
    return '';
  }
  if (!remoteSha) throw Object.assign(new Error('absent'), { status: 2 });
  return `${remoteSha}\t${ref}\n`;
};
for (const [winner, loser] of [[sha, other], [other, sha]]) {
  remoteSha = undefined;
  loadTag(producer(winner))('0.6.0', winner);
  loadTag(producer(loser))('0.6.0', loser);
  pin('0.6.0', winner, producer(winner));
  assert.throws(() => pin('0.6.0', loser, producer(loser)), /does not match/);
  assert.equal(remoteSha, winner, 'Losing producer must not move the winner tag');
}

const fixture = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'release-tag-'));
try {
  const remote = join(fixture, 'remote.git');
  const git = (args, options = {}) => execFileSync('git', args, {
    encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], ...options, cwd: fixture,
  });
  git(['init', '--bare', remote]);
  git(['init', '.']);
  git(['config', 'user.name', 'Release tag fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['remote', 'add', 'origin', remote]);
  const tree = git(['mktree'], { input: '' }).trim();
  const a = git(['commit-tree', tree, '-m', 'producer A']).trim();
  const b = git(['commit-tree', tree, '-p', a, '-m', 'producer B']).trim();
  const execute = (command, args, options) => {
    assert.equal(command, 'git');
    return git(Array.from(args), options);
  };
  loadTag(execute)('0.6.0', a);
  loadTag(execute)('0.6.0', b);
  pin('0.6.0', b, execute);
  pin('0.6.0', b, execute);
  assert.throws(() => pin('0.6.0', a, execute), /does not match/);
  assert.equal(git(['ls-remote', 'origin', 'refs/tags/v0.6.0']).trim(), `${b}\trefs/tags/v0.6.0`);
  loadTag(execute)('0.6.1', b);
  git(['push', 'origin', `${a}:refs/tags/v0.6.1`]);
  assert.throws(() => pin('0.6.1', b, execute), /does not match/);
  assert.equal(git(['ls-remote', 'origin', 'refs/tags/v0.6.1']).trim(), `${a}\trefs/tags/v0.6.1`);
  git(['-c', 'tag.gpgSign=false', 'tag', '-a', 'v0.6.2', a, '-m', 'annotated fixture']);
  git(['push', 'origin', 'refs/tags/v0.6.2:refs/tags/v0.6.2']);
  loadTag(execute)('0.6.2', a);
  pin('0.6.2', a, execute);
  assert.equal(git(['ls-remote', 'origin', 'refs/tags/v0.6.2^{}']).trim(), `${a}\trefs/tags/v0.6.2^{}`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log(JSON.stringify({ releaseWorkflow: true, validVersions: valid.length, invalidVersions: invalid.length, commitBinding: true, manifestMismatchRejected: true, tagOwnershipCases: tagCases.length, latePinCases: pinCases.length, producerInterleavings: 2, localBareGit: { positiveCases: 3, conflictRaces: 2 }, nonForcePin: true, mandatoryRemoteVerification: true }));
