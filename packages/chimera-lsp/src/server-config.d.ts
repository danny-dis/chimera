import type { LspServerConfig } from './types.js';
export declare function serverMatchesFile(server: LspServerConfig, filePath: string, workspaceRoot: string): boolean;
export declare function matchesRootFiles(server: LspServerConfig, workspaceRoot: string): boolean;
export declare function matchesPattern(value: string, pattern: string): boolean;
//# sourceMappingURL=server-config.d.ts.map