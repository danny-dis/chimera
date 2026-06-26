/**
 * Script discovery for workflow script nodes.
 * Finds .ts (bun) and .py (uv) scripts in repo and home directories.
 */
import { join } from 'path';
import { readdir } from 'fs/promises';
import { homedir } from 'os';

export type ScriptRuntime = 'bun' | 'uv';

export interface ScriptEntry {
  name: string;
  path: string;
  runtime: ScriptRuntime;
}

const SCRIPT_DIRS = ['.archon/scripts', join(homedir(), '.archon/scripts')];

function detectRuntime(filename: string): ScriptRuntime | null {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'bun';
  if (filename.endsWith('.py')) return 'uv';
  return null;
}

export async function discoverScriptsForCwd(cwd: string): Promise<Map<string, ScriptEntry>> {
  const scripts = new Map<string, ScriptEntry>();

  for (const dir of SCRIPT_DIRS) {
    const fullPath = dir.startsWith('/') ? dir : join(cwd, dir);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const runtime = detectRuntime(entry.name);
        if (!runtime) continue;
        const name = entry.name.replace(/\.(ts|tsx|py)$/, '');
        if (!scripts.has(name)) {
          scripts.set(name, {
            name,
            path: join(fullPath, entry.name),
            runtime,
          });
        }
      }
    } catch {
      // Directory doesn't exist or can't be read — skip
    }
  }

  return scripts;
}
