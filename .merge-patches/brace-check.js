// Brace-balance check (string/quote/comment aware)
const fs = require('fs');
const path = process.argv[2];
const text = fs.readFileSync(path, 'utf8');
let depth = 0;
let inStr = null; // '"' | "'" | '`' | null
let inLineComment = false;
let inBlockComment = false;
let line = 1;
let col = 0;
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  const next = text[i + 1];
  if (c === '\n') { line++; col = 0; inLineComment = false; continue; }
  col++;
  if (inLineComment) continue;
  if (inBlockComment) {
    if (c === '*' && next === '/') { inBlockComment = false; i++; }
    continue;
  }
  if (inStr) {
    if (c === '\\' && i + 1 < text.length) { i++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
  if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  if (c === '}') {
    depth--;
    if (depth < 0) {
      console.log('Stray } at line', line, 'col', col);
      depth = 0;
    }
  }
}
console.log('Final depth:', depth, '(0 = balanced)');
