export declare class CliRouter {
    private program;
    private verbose;
    private sessionStore;
    private memory;
    constructor();
    private initOrchestrator;
    private getProviders;
    private run;
    private printResult;
    private setupCommands;
    private startTui;
    private startRepl;
    private runParallel;
    runCli(argv: string[]): Promise<void>;
}
//# sourceMappingURL=cli-router.d.ts.map