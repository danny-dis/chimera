const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const original = Module._load;
const heavy = new Set(['vscode-languageserver-protocol', 'vscode-jsonrpc/node', 'yaml']);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-lsp-cold-entry-'));
let lsp;
try {
  Module._load = function(name, ...args) {
    if (heavy.has(name)) throw new Error(`Eager runtime dependency: ${name}`);
    return original.call(this, name, ...args);
  };
  lsp = require('../packages/chimera-lsp/dist/index.js');
  assert.equal(typeof lsp.ChimeraLspService, 'function');
  assert.equal(typeof lsp.createJsonRpcConnection, 'function');
  assert.equal(typeof lsp.ownedWindowsProcess('cmd.exe', []).command, 'string');
} catch (error) {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  throw error;
} finally { Module._load = original; }
(async () => {
  try {
    const missing = await lsp.loadLspConfig(root, path.join(root, 'missing.yaml'));
    assert.deepEqual(missing, lsp.DEFAULT_LSP_CONFIG);
    const file = path.join(root, 'lsp.yaml');
    fs.writeFileSync(file, 'lsp:\n  autoStart: false\n  servers:\n    fake:\n      command: node\n');
    const loaded = await lsp.loadLspConfig(root, file);
    assert.equal(loaded.autoStart, false);
    assert.equal(loaded.servers.fake.command, 'node');
    assert.deepEqual(loaded.servers.fake.args, []);
    console.log(JSON.stringify({ coldEntry: true, ownedProcessExport: true, deferredYamlParsing: true }));
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
