export declare class EnvironmentFilter {
    private blockedVars;
    private blockedPatterns;
    constructor(config?: {
        allowedVars?: string[];
        blockedVars?: string[];
        blockedPatterns?: RegExp[];
    });
    filter(env: Record<string, string>): Record<string, string>;
    isSecretVar(name: string): boolean;
    private isBlocked;
}
//# sourceMappingURL=env-filter.d.ts.map