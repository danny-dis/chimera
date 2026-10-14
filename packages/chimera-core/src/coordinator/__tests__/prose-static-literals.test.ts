import { expect, it } from 'vitest';
import { parseProseActions } from '../file-write-fallback.js';
it('extracts static template content instead of writing narrated tool-call code', () => {
  const code = 'function add(a,b) { return a+b; }\nmodule.exports={add};';
  const text = 'Create sum.js:\n```javascript\nwrite_file(\'sum.js\', `' + code + '`);\n```';
  const calls = parseProseActions(text, 'sum.js');
  expect(calls).toHaveLength(1);
  expect(calls[0].arguments).toMatchObject({ path: 'sum.js', content: code });
});
it('decodes escapes in narrated static quoted content', () => {
  const calls = parseProseActions('write_file("sum.js", "exports.add=(a,b)=>a+b;\\n")', 'sum.js');
  expect(calls[0].arguments.content).toBe('exports.add=(a,b)=>a+b;\n');
});
it.each([
  'write_file("sum.js", `${process.exit(42)}`)',
  '```js\nwrite_file("sum.js", `${process.exit(42)}`);\n```',
])('does not recover interpolated narration as source: %s', text => {
  expect(parseProseActions(text, 'sum.js')).toEqual([]);
});
