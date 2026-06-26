#!/usr/bin/env node
// Resolve merge-file conflicts by KEEPING BOTH SIDES (concatenating).
// Handles standard 3-way diff3 conflict format from git merge-file:
//   <<<<<<< current
//   [current side]
//   ||||||| BASE
//   [base side - usually empty when both sides added different content]
//   =======
//   [other side]
//   >>>>>>> other
// And the simpler 2-way format:
//   <<<<<<< current
//   [current side]
//   =======
//   [other side]
//   >>>>>>> other
//
// For "add to same place" conflicts, the right resolution is to keep both sides.

const fs = require('fs');
const path = process.argv[2];
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);
const out = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  if (!line.startsWith('<<<<<<<')) {
    out.push(line);
    i++;
    continue;
  }
  // Start of a conflict
  let depth = 1;
  let phase = 'current'; // 'current' | 'base' | 'other'
  const current = [];
  const other = [];
  const base = [];
  let j = i + 1;
  while (j < lines.length) {
    const l = lines[j];
    if (l.startsWith('<<<<<<<')) {
      depth++;
      if (phase === 'current') current.push(l);
      else if (phase === 'base') base.push(l);
      else other.push(l);
    } else if (l.startsWith('|||||||')) {
      phase = 'base';
    } else if (l === '=======') {
      if (phase === 'base') {
        phase = 'other';
      } else {
        depth--;
        if (depth === 0) break;
        if (phase === 'current') current.push(l);
        else if (phase === 'base') base.push(l);
        else other.push(l);
      }
    } else if (l.startsWith('>>>>>>>')) {
      depth--;
      if (depth === 0) break;
      if (phase === 'current') current.push(l);
      else if (phase === 'base') base.push(l);
      else other.push(l);
    } else {
      if (phase === 'current') current.push(l);
      else if (phase === 'base') base.push(l);
      else other.push(l);
    }
    j++;
  }
  if (j >= lines.length) {
    console.error('Unterminated conflict starting at line', i + 1);
    process.exit(1);
  }
  // Resolution: keep BOTH current and other. Drop base.
  out.push(...current, ...other);
  i = j + 1;
}

fs.writeFileSync(path, out.join('\n'));
console.log(`Resolved ${path}: input=${lines.length}, output=${out.length}, conflicts=${(text.match(/^<<<<<<</gm) || []).length}`);
