import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pnpm = process.env.npm_execpath;
assert(pnpm && /pnpm/i.test(pnpm), 'Run this gate with pnpm smoke:package');
const stage = mkdtempSync(join(tmpdir(), 'chimera-packed-consumer-'));
const manifests = new Map(readdirSync(join(root, 'packages')).flatMap(name => {
  try {
    const dir = join(root, 'packages', name);
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return [[manifest.name, { dir, manifest }]];
  } catch { return []; }
}));
const ordered = [];
const visited = new Set();
const visit = name => {
  if (visited.has(name)) return;
  visited.add(name);
  const pkg = manifests.get(name);
  assert(pkg, `Missing runtime workspace package: ${name}`);
  assert(!pkg.manifest.private, `Private runtime dependency cannot be published: ${name}`);
  for (const dep of Object.keys(pkg.manifest.dependencies ?? {})) if (dep.startsWith('@chimera/')) visit(dep);
  ordered.push(pkg);
};
visit('@chimera/cli');
const run = (executable, args, cwd = root, env = process.env) => {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  assert(!result.error, `Process failed: ${result.error?.code}`);
  assert.equal(result.status, 0, `${executable} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
};
try {
  const tarFlags = run('tar', ['--version']).includes('GNU tar') ? ['--force-local'] : [];
  const archives = {};
  for (const { dir, manifest } of ordered) {
    const packed = JSON.parse(run(process.execPath, [pnpm, '--dir', dir, 'pack', '--json', '--pack-destination', stage]));
    assert.equal(packed.name, manifest.name);
    const files = packed.files.map(file => file.path);
    assert(files.includes('LICENSE'), `${manifest.name}: missing license`);
    assert(files.includes(manifest.main.replace(/^\.\//, '')), `${manifest.name}: missing built main`);
    const forbidden = files.filter(file => /(?:^|\/)(?:src|research|node_modules|\.chimera|__tests__)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$|\.(?:test|spec)\./.test(file));
    assert.equal(forbidden.length, 0, `${manifest.name}: forbidden package contents: ${forbidden.join(', ')}`);
    const shipped = JSON.parse(run('tar', [...tarFlags, '-xOf', packed.filename, 'package/package.json']));
    assert(!Object.values(shipped.dependencies ?? {}).some(version => String(version).startsWith('workspace:')), `${manifest.name}: unresolved workspace protocol`);
    archives[manifest.name] = `file:${packed.filename.replaceAll('\\', '/')}`;
    console.log(JSON.stringify({ package: manifest.name, files: files.length, packed: true }));
  }
  const consumer = join(stage, 'consumer');
  mkdirSync(join(consumer, 'packages'), { recursive: true });
  const overrides = {};
  for (const [name, archive] of Object.entries(archives)) {
    const filename = basename(archive.slice(5));
    cpSync(archive.slice(5), join(consumer, 'packages', filename));
    overrides[name] = `file:packages/${filename}`;
  }
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'chimera-portable', private: true, version: manifests.get('@chimera/cli').manifest.version,
    engines: { node: '>=22.13.0' }, packageManager: 'pnpm@11.0.8',
    dependencies: { '@chimera/cli': overrides['@chimera/cli'] },
  }, null, 2));
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), JSON.stringify({ packages: [], overrides, allowBuilds: { koffi: false } }, null, 2));
  writeFileSync(join(consumer, 'chimera.cjs'), "#!/usr/bin/env node\nrequire(require.resolve('@chimera/cli'));\n");
  cpSync(join(root, 'LICENSE'), join(consumer, 'LICENSE'));
  const installArgs = [pnpm, '--dir', consumer, 'install', '--ignore-scripts'];
  if (process.env.CHIMERA_PACKAGE_OFFLINE === '1') installArgs.push('--offline');
  run(process.execPath, installArgs);
  const req = createRequire(join(consumer, 'package.json'));
  const entry = req.resolve('@chimera/cli');
  assert(entry.startsWith(consumer), 'Consumer resolved back into the development workspace');
  const env = { ...process.env, HOME: consumer, USERPROFILE: consumer };
  for (const key of Object.keys(env)) if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|BASE_URL|OLLAMA_HOST)$/.test(key)) delete env[key];
  const version = run(process.execPath, [entry, '--version'], consumer, env).trim();
  assert.equal(version, manifests.get('@chimera/cli').manifest.version);
  assert.equal(run(process.execPath, [pnpm, '--dir', consumer, 'exec', 'chimera', '--version'], consumer, env).trim(), version);
  const project = join(stage, 'project');
  mkdirSync(project);
  assert.equal(run(process.execPath, [join(consumer, 'chimera.cjs'), '--version'], project, env).trim(), version);
  assert.match(run(process.execPath, [entry, 'code', '--help'], consumer, env), /--verify/);
  assert.match(run(process.execPath, [entry, 'sessions'], consumer, env), /session/i);
  const workflows = run(process.execPath, [entry, 'workflow', 'list'], consumer, env);
  assert.match(workflows, /stepCount/);
  assert.match(workflows, /standard-draft/);
  const packedShell = await createRequire(entry)('@chimera/tools').runShellCommandTool.execute({
    command: `"${process.execPath}" -e "console.log('PACKED_SHELL_OK')"`, timeout: 10000,
  }, { workspaceRoot: consumer });
  assert.equal(packedShell.exitCode, 0, packedShell.stderr);
  assert.equal(packedShell.stdout.trim(), 'PACKED_SHELL_OK');
  console.log(JSON.stringify({ cleanConsumer: true, packages: ordered.length, version, cliHelp: true, installedShim: true, projectLauncher: true, sessions: true, workflowList: true, realShell: true }));
  if (process.env.CHIMERA_RELEASE_DIR) {
    const output = resolve(process.env.CHIMERA_RELEASE_DIR);
    const name = `chimera-${version}`;
    const download = join(stage, 'download');
    const bundle = join(download, name);
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(consumer, 'README.md'), `# Chimera ${version}\n\nRequires Node.js 22.13 or newer and pnpm 11.0.8. This bundle contains compiled\nruntime packages, not a standalone executable. Installation downloads external\ndependencies from the npm registry; it does not require unpublished @chimera packages.\n\nFrom this extracted directory:\n\n    pnpm install --frozen-lockfile --ignore-scripts\n    node chimera.cjs --version\n\nThen change to your project and run the launcher by its absolute path:\n\n    node /absolute/path/to/${name}/chimera.cjs setup\n    node /absolute/path/to/${name}/chimera.cjs code \"fix the failing tests\" --verify \"pnpm test\"\n\nOn Windows, use the equivalent C:/path/to/${name}/chimera.cjs path. Setup writes\nproject configuration and may send billable provider probes. Keep credentials out\nof version control. Review changes and run your own checks. Unattended reliability\nis not certified. See https://github.com/danny-dis/chimera for current limitations.\n`);
    for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'chimera.cjs', 'README.md', 'LICENSE', 'packages']) cpSync(join(consumer, file), join(bundle, file), { recursive: true });
    mkdirSync(output, { recursive: true });
    const archive = join(output, `${name}-runtime.tar.gz`);
    run('tar', [...tarFlags, '-czf', archive, '-C', download, name]);
    const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
    writeFileSync(join(output, 'SHA256SUMS'), `${sha256}  ${basename(archive)}\n`);
    console.log(JSON.stringify({ releaseArtifact: archive, sha256, packages: ordered.length, version }));
  }
} finally { rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
