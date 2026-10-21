import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export type VerificationInputs = Record<string, string>;

export function snapshotVerificationInputs(root: string, files: string[]): VerificationInputs {
  const workspace = resolve(root);
  return Object.fromEntries(files.map(file => {
    if (typeof file !== 'string' || !file.trim()) throw new Error('Invalid caller-owned verification input');
    const path = resolve(workspace, file);
    const within = relative(workspace, path);
    if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error('Verification inputs must be files inside the workspace');
    let current = workspace;
    if (lstatSync(current).isSymbolicLink()) throw new Error('Cannot protect symlinked verification inputs');
    for (const part of within.split(sep)) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw new Error('Cannot protect symlinked verification inputs');
    }
    if (!lstatSync(path).isFile()) throw new Error('Verification inputs must be regular files');
    return [file, createHash('sha256').update(readFileSync(path)).digest('hex')];
  }));
}

export function verificationInputsUnchanged(root: string, inputs: VerificationInputs): boolean {
  try {
    const current = snapshotVerificationInputs(root, Object.keys(inputs));
    return Object.entries(inputs).every(([file, digest]) => current[file] === digest);
  } catch { return false; }
}
