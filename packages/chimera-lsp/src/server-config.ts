import { existsSync } from 'fs';
import path from 'path';
import type { LspServerConfig } from './types.js';
import { toAbsolutePath } from './uri.js';

const DEFAULT_TYPESCRIPT_PATTERN = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

export function serverMatchesFile(
  server: LspServerConfig,
  filePath: string,
  workspaceRoot: string,
): boolean {
  if (server.enabled === false) return false;
  if (!matchesRootFiles(server, workspaceRoot)) return false;
  const relative = path.relative(workspaceRoot, toAbsolutePath(filePath, workspaceRoot)).replace(/\\/g, '/');
  if (server.filePatterns && server.filePatterns.length > 0) {
    return server.filePatterns.some((pattern) => matchesPattern(relative, pattern));
  }
  if (!server.rootFiles || server.rootFiles.length === 0) {
    return matchesPattern(relative, DEFAULT_TYPESCRIPT_PATTERN);
  }
  return true;
}

export function matchesRootFiles(server: LspServerConfig, workspaceRoot: string): boolean {
  if (!server.rootFiles || server.rootFiles.length === 0) return true;
  return server.rootFiles.some((file) => existsSync(path.join(workspaceRoot, file)));
}

export function matchesPattern(value: string, pattern: string): boolean {
  const regex = new RegExp(`^${toRegexSource(pattern)}$`);
  return regex.test(value.replace(/\\/g, '/'));
}

function toRegexSource(pattern: string): string {
  const normalized = pattern.replace(/\\/g, '/');
  let source = '';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          // `**/` matches zero or more directories — a root-level file must
          // match `**/*.ts` too (standard glob semantics).
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i++;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      const end = normalized.indexOf('}', i);
      if (end !== -1) {
        const alternatives = normalized.slice(i + 1, end).split(',');
        source += `(?:${alternatives.map((alt) => escapeRegex(alt)).join('|')})`;
        i = end;
      } else {
        source += escapeRegex(char);
      }
    } else {
      source += escapeRegex(char);
    }
  }
  return source;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
