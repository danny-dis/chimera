export interface PTYOptions {
    command: string;
    cwd: string;
    timeout: number;
    env: Record<string, string>;
    maxOutputBytes?: number;
}
export declare class PTYExecutor {
    private workspaceRoot;
    private currentProcess;
    constructor(options: {
        workspaceRoot: string;
        defaultTimeout: number;
    });
    execute(options: PTYOptions): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
        duration: number;
    }>;
    kill(): void;
    private truncateOutput;
}
//# sourceMappingURL=pty-executor.d.ts.map