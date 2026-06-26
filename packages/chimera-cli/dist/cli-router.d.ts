export declare class CliRouter {
    private program;
    private verbose;
    private noLearn;
    private sessionStore;
    private memory;
    private learningEngine;
    constructor();
    private initOrchestrator;
    private getProviders;
    /**
     * Load the workflow registry (workspace + global + builtins) and resolve
     * the default workflow for the given mode.
     */
    private resolveWorkflow;
    private run;
    private printResult;
    /**
     * Run the learning engine on a completed session checkpoint.
     * Fire-and-forget: errors are swallowed unless verbose mode is on.
     */
    private learnFromCheckpoint;
    private setupCommands;
    private startTui;
    private startRepl;
    private runParallel;
    private runLoop;
    private runGoal;
    /** Print the full list of supported modes to stdout. Used by tests. */
    printModeList(): void;
    runCli(argv: string[]): Promise<void>;
}
//# sourceMappingURL=cli-router.d.ts.map