import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

const PathRestrictionConfigSchema = z.object({
  workspaceRoot: z.string(),
  allowedPatterns: z.array(z.string()).optional(),
});

export class PathRestrictionEngine {
  private resolvedWorkspace: string;
  private originalWorkspace: string;
  private allowedPatterns: RegExp[];
  // Fail closed: when the workspace root itself cannot be canonicalized we
  // cannot trust any path under it, so every containment check is a violation.
  private workspaceUnresolvable = false;

  constructor(workspaceRoot: string, allowedPatterns?: string[]) {
    PathRestrictionConfigSchema.parse({ workspaceRoot, allowedPatterns });
    const resolved = path.resolve(workspaceRoot);
    this.originalWorkspace = resolved;
    try {
      this.resolvedWorkspace = fs.realpathSync(resolved);
    } catch (err: unknown) {
      // ENOENT (a not-yet-created target) is legitimate — the lexical root is
      // still a safe containment anchor. Any other failure (EACCES, EPERM,
      // ELOOP, …) means we cannot verify the root, so refuse all paths.
      const code = (err as NodeJS.ErrnoException)?.code;
      this.resolvedWorkspace = resolved;
      this.workspaceUnresolvable = code !== 'ENOENT';
    }
    this.allowedPatterns = (allowedPatterns ?? []).map((p) => new RegExp(p));
  }

  isPathAllowed(inputPath: string): boolean {
    return this.getViolation(inputPath) === null;
  }

  /** Canonical (realpath) workspace root; the lexical root when unresolvable. */
  getCanonicalRoot(): string {
    return this.resolvedWorkspace;
  }

  resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
      return path.normalize(inputPath);
    }
    return path.normalize(path.join(this.resolvedWorkspace, inputPath));
  }

  getViolation(inputPath: string): string | null {
    if (this.workspaceUnresolvable) {
      return 'Workspace root could not be canonicalized';
    }

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
    const workspace = this.resolvedWorkspace;
    let target = resolvedPath;

    let realPath: string;
    try {
      realPath = fs.realpathSync(target);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        return true;
      }
      let parent = path.dirname(target);
      while (parent !== target) {
        if (target === workspace) {
          // We reached the workspace boundary itself: a missing root (or a
          // missing leaf directly under it) is still a safe containment
          // anchor — legitimate not-yet-created paths stay allowed.
          return false;
        }
        // Attempt canonical resolution of each ancestor (INCLUDING the
        // workspace boundary itself) before declaring the missing leaf safe.
        // Previously the walk short-circuited to `false` at `parent ===
        // workspace` without ever resolving it, so a root that became
        // unresolvable (EACCES) after construction silently bypassed the
        // check.
        try {
          realPath = fs.realpathSync(parent);
        } catch (parentErr: unknown) {
          const parentCode = (parentErr as NodeJS.ErrnoException).code;
          if (parentCode !== 'ENOENT') {
            // Cannot verify containment (EACCES/EPERM/ELOOP) — fail closed.
            return true;
          }
          if (parent === workspace) {
            // The boundary itself does not exist yet: a legitimate
            // not-yet-created root is still a safe containment anchor.
            return false;
          }
          target = parent;
          parent = path.dirname(parent);
          continue;
        }
        // Ancestor exists and canonicalized. A missing leaf under an ancestor
        // that resolves inside the workspace stays inside; otherwise it escapes.
        return !this.isWithinWorkspace(realPath);
      }
      return !this.isWithinWorkspace(target);
    }

    if (realPath === workspace) {
      return false;
    }
    if (!this.isWithinWorkspace(target)) {
      return false;
    }
    return !this.isWithinWorkspace(realPath);
  }
}
