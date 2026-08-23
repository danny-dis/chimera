// Guard: syntax-oracle write refusal — malformed JS refused, valid JS (incl.
// ESM export/import) accepted.
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
const r = createRequire('file:///C:/Users/pc/Documents/projects/chimera/packages/chimera-cli/package.json');
const { ToolRegistry, ToolExecutor, allTools } = r('@chimera/tools');
const { EventStream } = r('@chimera/core');

let failed = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++; } else console.log('PASS:', m); };

const reg = new ToolRegistry();
for (const t of allTools) reg.register(t);
const ex = new ToolExecutor(reg, () => 'allow');
const es = new EventStream();
const ws = mkdtempSync(join(tmpdir(), 'guard-syntax-'));

const cases = [
  ['x.js', 'module.exports = { a, b; }', false],          // malformed → refuse
  ['y.js', 'function f() {\n  return arr.length - 1;\n}\nmodule.exports = { f };', true],
  ['greet.js', 'export function greet(){ return "hi"; }', true], // ESM export ok
  ['app.js', 'import path from "path";\nexport default path.sep;', true],   // import ok
  ['style.css', 'body { color: red; }', true],            // non-JS skipped
  ['data.json', '{"a": 1}', true],
];

for (const [file, content, shouldPass] of cases) {
  const res = await ex.execute('write_file', { path: file, content }, { workspaceRoot: ws, sessionId: 'g', eventStream: es });
  assert(res.success === shouldPass, `${file} ${shouldPass ? 'accepted' : 'refused'}`);
}

process.exit(failed ? 1 : 0);
