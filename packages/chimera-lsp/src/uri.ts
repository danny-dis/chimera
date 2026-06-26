import path from 'path';
import { URI } from 'vscode-uri';

export function pathToUri(filePath: string, workspaceRoot: string): string {
  const absolute = filePath.startsWith('file:') ? filePath : toAbsolutePath(filePath, workspaceRoot);
  return URI.file(absolute).toString();
}

export function uriToPath(uri: string): string {
  return URI.parse(uri).fsPath;
}

export function toAbsolutePath(filePath: string, workspaceRoot: string): string {
  if (filePath.startsWith('file:')) return uriToPath(filePath);
  return filePath.match(/^[A-Za-z]:[\\/]/) || filePath.startsWith('\\\\') || filePath.startsWith('/')
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

export function relativePath(filePath: string, workspaceRoot: string): string {
  const absolute = toAbsolutePath(filePath, workspaceRoot);
  const relative = path.relative(workspaceRoot, absolute);
  return relative || '.';
}
