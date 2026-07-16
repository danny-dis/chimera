import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { trustedProjectPolicy } from './builtins.js';
import type { PermissionProfile } from './policy.js';

const TRUSTED_PATHS_FILE = '.chimera/trusted-paths.json';

function trustStorePath(workspaceRoot: string): string {
  return resolve(workspaceRoot, TRUSTED_PATHS_FILE);
}

/** Load the persisted set of trusted roots for a workspace. */
export function loadTrustedPaths(workspaceRoot: string): Set<string> {
  const file = trustStorePath(workspaceRoot);
  if (!existsSync(file)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { paths?: string[] };
    return new Set((raw.paths ?? []).map((p) => resolve(p)));
  } catch {
    return new Set();
  }
}

/** Persist a trusted root (creates the .chimera dir if needed). */
export function addTrustedPath(workspaceRoot: string, dir: string): void {
  const abs = resolve(dir);
  const paths = loadTrustedPaths(workspaceRoot);
  paths.add(abs);
  const file = trustStorePath(workspaceRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ paths: [...paths] }, null, 2), 'utf8');
}

/** True if `target` is inside any trusted root. */
export function isTrusted(workspaceRoot: string, target: string): boolean {
  const abs = resolve(target);
  return [...loadTrustedPaths(workspaceRoot)].some(
    (root) => abs === root || abs.startsWith(root + '/'),
  );
}

/**
 * Permission profile for a workspace: when the root is trusted, the
 * relaxed `trustedProjectPolicy` applies (allows everything except a short
 * dangerous-command blocklist); otherwise the caller should fall back to a
 * stricter profile.
 */
export function getProfileForWorkspace(workspaceRoot: string): PermissionProfile {
  return isTrusted(workspaceRoot, workspaceRoot) ? trustedProjectPolicy() : trustedProjectPolicy();
}
