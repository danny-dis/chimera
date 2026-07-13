import { createRequire } from 'module';
import { join } from 'path';
const repoRoot = 'C:/Users/pc/Documents/projects/chimera';
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));
const { parseProseActions } = require(join(repoRoot, 'packages', 'chimera-core', 'dist', 'coordinator', 'file-write-fallback.js'));

const samples = {
  actionWrite: `### ACTION: WRITE greeter.js
\`\`\`js
export function greet(name) { return 'Hello, ' + name; }
\`\`\``,
  actionEdit: `### ACTION: EDIT greeter.js
OLD:
\`\`\`
export function greet(name) { return 'Hi, ' + name; }
\`\`\`
NEW:
\`\`\`
export function greet(name) { return 'Hello, ' + name; }
\`\`\``,
  delta: `**DELTA:** greeter.js:1-4
\`\`\`js
export function greet(name) { return 'Hello, ' + name; }
\`\`\``,
  plain: `Here is the code:
\`\`\`js
export function greet(name) { return 'Hello, ' + name; }
\`\`\``,
  inlineArg: `Now I'll write the file: write_file('greeter.js', 'export function greet(name) { return "Hello, " + name; }\n') and that's it.`,
};

for (const [k, text] of Object.entries(samples)) {
  const calls = parseProseActions(text);
  console.log(`[${k}] -> ${calls.length} call(s): ` + calls.map(c => `${c.name}(${JSON.stringify(c.arguments)})`).join(' | '));
}

// ponytail self-check: branch 4c must parse the inline-arg form.
const inlineCalls = parseProseActions(samples.inlineArg);
const hit = inlineCalls.find(c => c.name === 'write_file' && c.arguments.path === 'greeter.js');
if (!hit) {
  console.error('SELF-CHECK FAILED: inline-arg write_file(\'path\', \'content\') not parsed');
  process.exit(1);
}
console.log('SELF-CHECK OK: inline-arg form parsed');
