import { existsSync } from 'fs';
import path from 'path';
import type { LspServerConfig } from './types.js';
import { toAbsolutePath } from './uri.js';

export function serverMatchesFile(
  server: LspServerConfig,
  filePath: string,
  workspaceRoot: string,
): boolean {
  if (server.enabled === false) return false;
  if (!matchesRootFiles(server, workspaceRoot)) return false;
  if (server.filePatterns && server.filePatterns.length > 0) {
    const relative = path.relative(workspaceRoot, toAbsolutePath(filePath, workspaceRoot)).replace(/\\/g, '/');
    return server.filePatterns.some((pattern) => matchesPattern(relative, pattern));
  }
  return true;
}

export function matchesRootFiles(server: LspServerConfig, workspaceRoot: string): boolean {
  if (!server.rootFiles || server.rootFiles.length === 0) return true;
  return server.rootFiles.some((file) => existsSync(path.join(workspaceRoot, file)));
}

export function matchesPattern(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const regex = new RegExp(`^${escapeRegex(normalizedPattern)
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]')}$`);
  return regex.test(value.replace(/\\/g, '/'));
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
