const assert = require('node:assert/strict');
const { CliRouter } = require('../packages/chimera-cli/dist/cli-router.js');
new CliRouter();
const loaded = Object.keys(require.cache).map(file => file.replace(/\\/g, '/'));
const eager = loaded.filter(file =>
  /\/execa\/|\/execa@|\/chimera-lsp\/dist\/lsp-service\.js$|\/chimera-isolation\/dist\//.test(file));
assert.deepEqual(eager, [], 'CLI registration must not load process execution, LSP, or worktree cleanup');
console.log(JSON.stringify({ lazyStartup: true }));
