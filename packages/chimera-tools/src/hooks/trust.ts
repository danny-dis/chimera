// Workspace trust gate for hooks.
//
// A cloned repo can ship `.chimera/hooks.yaml` whose scripts execute on every
// tool call. grok-build blocks untrusted project hooks/MCP (trust.rs) — a
// workspace must be explicitly trusted before its hooks run. This mirrors that
// at the single load chokepoint so no caller bypasses it.
//
// ponytail: trust is per-workspace-root, stored as one canonical path per line
// in ~/.chimera/trusted-workspaces. No per-hook granularity — add when a real
// need appears (e.g. per-hook allowlists).

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Resolve the trust store path lazily (not at module load) so tests can
 * isolate it via CHIMERA_TRUST_STORE without ever touching the real
 * developer home directory. Production callers get the same default as
 * before: ~/.chimera/trusted-workspaces.
 */
export function trustStorePath(): string {
  return process.env.CHIMERA_TRUST_STORE || path.join(os.homedir(), '.chimera', 'trusted-workspaces');
}

/** Canonicalize so symlinks and `./` variants resolve to one key. */
function canonical(root: string): string {
  try {
    return path.resolve(root);
  } catch {
    return root;
  }
}

export async function isWorkspaceTrusted(workspaceRoot: string): Promise<boolean> {
  try {
    const content = await fs.readFile(trustStorePath(), 'utf-8');
    const trusted = new Set(
      content.split('\n').map((l) => l.trim()).filter(Boolean).map(canonical),
    );
    return trusted.has(canonical(workspaceRoot));
  } catch {
    return false;
  }
}

/** Persist a workspace as trusted (idempotent, dedupes). */
export async function trustWorkspace(workspaceRoot: string): Promise<void> {
  const canonicalRoot = canonical(workspaceRoot);
  const storeFile = trustStorePath();
  let lines: string[] = [];
  try {
    const content = await fs.readFile(storeFile, 'utf-8');
    lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    // file missing -> start fresh
  }
  if (!lines.map(canonical).includes(canonicalRoot)) {
    lines.push(canonicalRoot);
    await fs.mkdir(path.dirname(storeFile), { recursive: true });
    await fs.writeFile(storeFile, lines.join('\n') + '\n', 'utf-8');
  }
}
