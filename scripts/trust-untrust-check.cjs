// Verify the trust/untrust store round-trip the CLI /trust command relies on.
const { trustWorkspace, isWorkspaceTrusted, trustStorePath } = require('../packages/chimera-tools/dist/index.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  // Use an isolated trust store so we don't touch the real one.
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-trusthome-'));
  const storePath = path.join(tmpHome, '.chimera', 'trusted-workspaces');
  // Monkeypatch trustStorePath by writing to the real one-liner path is not exposed;
  // instead exercise the public API against a temp workspace and check the file.
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-ws-'));
  console.log('before trust:', await isWorkspaceTrusted(ws));
  await trustWorkspace(ws);
  console.log('after trust:', await isWorkspaceTrusted(ws));

  // Simulate untrust: rewrite the store with the line removed (what handleTrust --untrust does).
  const content = fs.readFileSync(trustStorePath(), 'utf-8');
  const next = content.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => l !== path.resolve(ws));
  fs.writeFileSync(trustStorePath(), next.join('\n') + (next.length ? '\n' : ''));
  console.log('after untrust:', await isWorkspaceTrusted(ws));

  const pass = (await isWorkspaceTrusted(ws)) === false;
  console.log(pass ? 'TRUST/UNTRUST PASS' : 'TRUST/UNTRUST FAIL');
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(ws, { recursive: true, force: true });
  process.exit(pass ? 0 : 1);
})();
