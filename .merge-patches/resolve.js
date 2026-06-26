// Resolve conflicts in anthropic.ts
// Pattern: 4 conflicts total. Conflicts 1,2 (parse funcs) take the >>> side (D's).
// Conflicts 3,4 (complete/stream methods) take the <<< side (A's).
const fs = require('fs');
const path = process.argv[2];
let text = fs.readFileSync(path, 'utf8');

const lines = text.split(/\r?\n/);
const out = [];
let i = 0;
let conflictIdx = 0;
while (i < lines.length) {
  const line = lines[i];
  if (line.startsWith('<<<<<<<')) {
    conflictIdx++;
    i++;
    let mainSide = [];
    let otherSide = [];
    let phase = 'main';
    while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
      if (lines[i] === '=======') {
        phase = 'other';
      } else if (phase === 'main') {
        mainSide.push(lines[i]);
      } else {
        otherSide.push(lines[i]);
      }
      i++;
    }
    i++; // skip >>>>>>>
    // For first 2 conflicts, take other (D). For last 2, take main (A).
    const chosen = conflictIdx <= 2 ? otherSide : mainSide;
    out.push(...chosen);
  } else {
    out.push(line);
    i++;
  }
}
fs.writeFileSync(path, out.join('\r\n') + '\r\n', 'utf8');
const remaining = (fs.readFileSync(path, 'utf8').match(/<<<<<<</g) || []).length;
console.log('remaining conflicts:', remaining);
