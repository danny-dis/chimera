export declare class PathRestrictionEngine {
    private resolvedWorkspace;
    private allowedPatterns;
    constructor(workspaceRoot: string, allowedPatterns?: string[]);
    isPathAllowed(inputPath: string): boolean;
    resolvePath(inputPath: string): string;
    getViolation(inputPath: string): string | null;
    private containsTraversal;
    private isWithinWorkspace;
    private isSymlinkEscaping;
}
//# sourceMappingURL=path-restrictions.d.ts.map