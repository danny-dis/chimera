function contentLooksTruncated(s) {
  const trimmed = s.replace(/\s+$/, '');
  if (trimmed.length === 0) return true;

  const openers = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    // Line comment
    if (ch === '/' && next === '/') {
      while (i < trimmed.length && trimmed[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < trimmed.length && !(trimmed[i] === '*' && trimmed[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String / template literal — skip its entire body
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < trimmed.length) {
        if (trimmed[i] === '\\') { i += 2; continue; }
        if (trimmed[i] === q) { i++; break; }
        i++;
      }
      // Ran off the end without a closing quote -> truncated.
      if (i >= trimmed.length) return true;
      continue;
    }
    if (ch in openers) { stack.push(ch); i++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      const expect = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (stack.pop() !== expect) return true;
      i++;
      continue;
    }
    i++;
  }
  if (stack.length > 0) return true;

  // Ends mid-token: a line ending in a known statement keyword that requires a
  // body/value (e.g. `return`, `function greet(name) {` already caught by
  // brackets, but `return` alone or `const x =` ...). Conservative: only flag
  // when the final token is a keyword that cannot legally end a statement.
  if (/(?:^|[^A-Za-z0-9_$])(return|function|const|let|var|export|import|await|async|if|for|while|class|else|public|private|interface|type|enum)\s*[A-Za-z0-9_$.({[]*$/.test(trimmed)) {
    return true;
  }

  return false;
}
const cases = [
  ["export function greet(name) {\n  return 'Hello, ' + name;\n}\n\nmodule.exports = greet;", false],
  ["function greet(name) {\n  return", true],
  ["export function greet(name) { return ", true],
  ["", true],
  ["hello world", false],
  ["const x = 5;", false],
  ['const s = "unterminated', true],
  ["function f() {\n  return 1;\n}\n", false],
  ["return", true],
  ["const a = [1, 2, 3];", false],
  ["const a = [1, 2,", true],
  ["if (x > 0) {", true],
  ['console.log("done");', false],
  ["export default greet;", false],
  ["  greet", false],
  ["name", false],
];
let pass=0, fail=0;
for (const [inp, exp] of cases) {
  const got = contentLooksTruncated(inp);
  const ok = got === exp;
  console.log((ok?'PASS':'FAIL')+' truncated='+got+' expected='+exp+'  '+JSON.stringify(inp.slice(0,38)));
  ok?pass++:fail++;
}
console.log('PASS='+pass+' FAIL='+fail);
