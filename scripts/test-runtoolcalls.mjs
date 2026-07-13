import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync, existsSync, rmSync, writeFileSync } from 'fs';
const repoRoot = 'C:/Users/pc/Documents/projects/chimera';
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
for (const line of readFileSync(join(repoRoot, '.env'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { EventStream } = require('@chimera/core');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');
const { runToolCalls } = require(join(repoRoot, 'packages', 'chimera-core', 'dist', 'coordinator', 'tool-execution-helper.js'));
const cwd = process.cwd();
const f = join(cwd, 'greeter.js');
if (existsSync(f)) rmSync(f);
const es = new EventStream();
const reg = new ToolRegistry(allTools);
const exec = new ToolExecutor({ workspaceRoot: cwd });
const calls = [{ id: 't1', name: 'write_file', arguments: { path: 'greeter.js', content: "function greet(n){return 'Hello, '+n;}" } }];
try {
  const res = await runToolCalls({ toolCalls: calls, toolExecutor: exec, toolRegistry: reg, eventStream: es, workspaceRoot: cwd, sessionId: 'dbg' });
  console.log('RESULT=' + JSON.stringify(res));
} catch (e) {
  console.log('THROWN=' + (e && e.stack ? e.stack.slice(0, 600) : String(e)));
}
console.log('FILE_EXISTS=' + existsSync(f));
if (existsSync(f)) console.log('CONTENT=' + readFileSync(f, 'utf-8'));
