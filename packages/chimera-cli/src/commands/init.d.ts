export interface InitAgentsMdOptions {
    /** Overwrite an existing AGENTS.md. Defaults to false. */
    force?: boolean;
}
export interface InitAgentsMdResult {
    /** Absolute path of the file that was written (or already existed). */
    path: string;
    /** Bytes written. Zero when the file already existed and was not overwritten. */
    bytesWritten: number;
}
/**
 * Detect project metadata and write `AGENTS.md` at the workspace root.
 * Returns the file path and the number of bytes written. If the file
 * already exists and `force` is not set, returns `bytesWritten: 0` and
 * does not touch the file.
 */
export declare function initAgentsMd(workspaceRoot: string, opts?: InitAgentsMdOptions): Promise<InitAgentsMdResult>;
//# sourceMappingURL=init.d.ts.map