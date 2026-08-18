// scripts/grade-task.mjs
// Objective grading: run HIDDEN tests against the artifact on disk (BUG-4).
//
// Replaces the completion rubric in score-combo.mjs for gradeable modes. The
// rubric gave hive 0.88 for merely "finished + wrote a file + no error event",
// which said nothing about whether the code worked. This returns
// passed/total from real assertions the model never saw.
//
// Each artifact is required in a SEPARATE subprocess so a file that throws on
// load, hangs, or calls process.exit cannot take the harness down with it.

import { execFileSync } from 'child_process';
import { existsSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TASKS } from './task-suite.mjs';

// Build a runner script that loads the artifact and prints one JSON line per
// assertion. `m` is the module; bare `slugify(...)` also works when the module
// exports the function directly.
function buildRunner(target, tests) {
  const lines = [
    'const path = require("path");',
    `const m = require(${JSON.stringify('./' + target)});`,
    'const fn = (typeof m === "function") ? m : null;',
    'const slugify = fn || m.slugify;',
    'const out = [];',
  ];
  for (const [label, expr, expected] of tests) {
    lines.push(
      'try {',
      `  const actual = (${expr});`,
      `  out.push({ label: ${JSON.stringify(label)}, ok: JSON.stringify(actual) === JSON.stringify(${JSON.stringify(expected)}), actual: String(actual).slice(0,60) });`,
      '} catch (e) {',
      `  out.push({ label: ${JSON.stringify(label)}, ok: false, actual: "THREW: " + String(e && e.message).slice(0,60) });`,
      '}',
    );
  }
  lines.push('process.stdout.write(JSON.stringify(out));');
  return lines.join('\n');
}

/**
 * Grade the workdir for a mode.
 * Returns { gradeable, targetExists, passed, total, ratio, failures[], loadError }
 */
export function gradeTask(mode, workdir) {
  const task = TASKS[mode];
  if (!task) return { gradeable: false, passed: 0, total: 0, ratio: null };

  const targetPath = join(workdir, task.target);
  const targetExists = existsSync(targetPath);
  const total = task.tests.length;
  if (!targetExists) {
    return {
      gradeable: true, targetExists: false, passed: 0, total, ratio: 0,
      failures: ['target file missing: ' + task.target], loadError: '',
    };
  }

  const runnerPath = join(workdir, '__grade_runner.cjs');
  writeFileSync(runnerPath, buildRunner(task.target, task.tests));

  let raw = '';
  let loadError = '';
  try {
    raw = execFileSync(process.execPath, [runnerPath], {
      cwd: workdir, stdio: 'pipe', timeout: 20000, encoding: 'utf-8',
    });
  } catch (e) {
    // Artifact failed to load at all → every assertion fails. This is the
    // "landed != correct" case, now scored 0 instead of earning a disk bonus.
    loadError = String(e?.stderr || e?.message || e).slice(0, 300);
    return {
      gradeable: true, targetExists: true, passed: 0, total, ratio: 0,
      failures: ['artifact did not load'], loadError,
    };
  }

  let rows = [];
  try { rows = JSON.parse(raw); } catch {
    return {
      gradeable: true, targetExists: true, passed: 0, total, ratio: 0,
      failures: ['grader output unparseable'], loadError: raw.slice(0, 200),
    };
  }

  const passed = rows.filter((r) => r.ok).length;
  const failures = rows.filter((r) => !r.ok).map((r) => `${r.label} (got ${r.actual})`);
  return {
    gradeable: true, targetExists: true, passed, total,
    ratio: total ? passed / total : 0, failures, loadError: '',
  };
}

// Seed any pre-existing files a task needs (buggy sources for debug mode).
export function seedTask(mode, workdir) {
  const task = TASKS[mode];
  if (!task || !task.seed) return;
  for (const [name, content] of Object.entries(task.seed)) {
    writeFileSync(join(workdir, name), content);
  }
}

// Syntax + load validity across every .js the run produced (kept from the
// original harness — still the truncation guard).
export function validateJsFiles(workdir) {
  let valid = 0, broken = 0, ran = 0;
  const files = [];
  let runError = '';
  for (const f of readdirSync(workdir)) {
    if (!f.endsWith('.js') || f.startsWith('__grade_runner')) continue;
    const fp = join(workdir, f);
    files.push(f);
    try { execFileSync(process.execPath, ['--check', fp], { stdio: 'pipe' }); valid++; }
    catch { broken++; }
    try { execFileSync(process.execPath, ['-e', `require(${JSON.stringify(fp)})`], { stdio: 'pipe', timeout: 15000 }); ran++; }
    catch (e) { if (!runError) runError = String(e?.stderr || e?.message || e).slice(0, 200); }
  }
  return { valid, broken, ran, files, runError };
}
