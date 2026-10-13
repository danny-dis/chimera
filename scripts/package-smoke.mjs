import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'chimera-package-consumer', private: true, dependencies: { '@chimera/cli': archives['@chimera/cli'] } }, null, 2));
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), JSON.stringify({ packages: [], overrides: archives }, null, 2));
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
  assert.match(run(process.execPath, [entry, 'code', '--help'], consumer, env), /--verify/);
  assert.match(run(process.execPath, [entry, 'sessions'], consumer, env), /session/i);
  const workflows = run(process.execPath, [entry, 'workflow', 'list'], consumer, env);
  assert.match(workflows, /stepCount/);
  assert.match(workflows, /standard-draft/);
  console.log(JSON.stringify({ cleanConsumer: true, packages: ordered.length, version, cliHelp: true, sessions: true, workflowList: true, providerCalls: 0 }));
} finally { rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
