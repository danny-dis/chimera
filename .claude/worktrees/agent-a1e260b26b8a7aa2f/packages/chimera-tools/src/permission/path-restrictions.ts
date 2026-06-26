import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

const PathRestrictionConfigSchema = z.object({
  workspaceRoot: z.string(),
  allowedPatterns: z.array(z.string()).optional(),
});

export class PathRestrictionEngine {
  private resolvedWorkspace: string;
  private allowedPatterns: RegExp[];

  constructor(workspaceRoot: string, allowedPatterns?: string[]) {
    PathRestrictionConfigSchema.parse({ workspaceRoot, allowedPatterns });
    this.resolvedWorkspace = path.resolve(workspaceRoot);
    this.allowedPatterns = (allowedPatterns ?? []).map((p) => new RegExp(p));
  }

  isPathAllowed(inputPath: string): boolean {
    return this.getViolation(inputPath) === null;
  }

  resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
      return path.normalize(inputPath);
    }
    return path.normalize(path.join(this.resolvedWorkspace, inputPath));
  }

  getViolation(inputPath: string): string | null {
    if (this.containsTraversal(inputPath)) {
      return 'Path traversal detected (../ sequences)';
    }

    const resolved = this.resolvePath(inputPath);

    if (path.isAbsolute(inputPath) && !this.isWithinWorkspace(resolved)) {
      for (const pattern of this.allowedPatterns) {
        if (pattern.test(resolved)) {
          return null;
        }
      }
      return `Absolute path outside workspace: ${resolved}`;
    }

    if (!this.isWithinWorkspace(resolved)) {
      for (const pattern of this.allowedPatterns) {
        if (pattern.test(resolved)) {
          return null;
        }
      }
      return `Resolved path escapes workspace: ${resolved}`;
    }

    if (this.isSymlinkEscaping(resolved)) {
      return 'Symlink resolves outside workspace';
    }

    return null;
  }

  private containsTraversal(inputPath: string): boolean {
    const normalized = path.normalize(inputPath);
    const segments = normalized.split(path.sep);
    let depth = 0;
    for (const segment of segments) {
      if (segment === '..') {
        depth -= 1;
        if (depth < 0) return true;
      } else if (segment !== '' && segment !== '.') {
        depth += 1;
      }
    }
    return false;
  }

  private isWithinWorkspace(resolvedPath: string): boolean {
    const relative = path.relative(this.resolvedWorkspace, resolvedPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private isSymlinkEscaping(resolvedPath: string): boolean {
    try {
      if (!fs.existsSync(resolvedPath)) {
        return false;
      }
      const realPath = fs.realpathSync(resolvedPath);
      return !this.isWithinWorkspace(realPath);
    } catch {
      return false;
    }
  }
}
