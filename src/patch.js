import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { evaluateCommandPermission } from './policy.js';

export async function loadPatch(root, patchPath) {
  if (!patchPath) throw new Error('patch mode requires a path to a unified diff file.');
  const absolute = path.resolve(root, patchPath);
  const text = await fs.readFile(absolute, 'utf8');
  return { path: absolute, text, files: extractPatchFiles(text) };
}

export function extractPatchFiles(text) {
  const files = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('+++ ') && !line.startsWith('--- ')) continue;
    const raw = line.slice(4).trim().split(/\s+/)[0];
    if (raw === '/dev/null') continue;
    const normalized = raw.replace(/^a\//, '').replace(/^b\//, '');
    if (normalized) files.add(normalized);
  }
  return [...files].sort();
}

export function validatePatchPaths(files) {
  const invalid = files.filter((file) => path.isAbsolute(file) || file.includes('..') || file.startsWith('.git/'));
  return {
    valid: invalid.length === 0,
    invalid,
    reason: invalid.length ? `Patch contains unsafe paths: ${invalid.join(', ')}` : 'Patch paths are workspace-relative.',
  };
}

export async function checkPatch(root, patchText) {
  const result = await gitApply(root, ['apply', '--check', '-'], patchText);
  return {
    ok: result.exitCode === 0,
    ...result,
  };
}

export async function applyPatch(root, patchText, permissionProfile = 'read-only') {
  const decision = evaluateCommandPermission('git apply <patch>', permissionProfile);
  if (!decision.allowed) {
    return {
      applied: false,
      skipped: true,
      decision,
      exitCode: null,
      stdout: '',
      stderr: decision.reason,
    };
  }
  const result = await gitApply(root, ['apply', '-'], patchText);
  return {
    applied: result.exitCode === 0,
    skipped: false,
    decision,
    ...result,
  };
}

function gitApply(root, args, input) {
  return new Promise((resolve) => {
    const child = execFile('git', args, { cwd: root, timeout: 30_000, maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
      resolve({
        exitCode: error?.code ?? 0,
        stdout: trim(stdout),
        stderr: trim(stderr || error?.message || ''),
      });
    });
    child.stdin?.end(input);
  });
}

function trim(output = '') {
  return output.trim();
}
