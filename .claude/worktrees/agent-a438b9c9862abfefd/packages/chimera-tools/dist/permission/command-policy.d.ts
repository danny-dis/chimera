export declare const DEFAULT_DANGEROUS_COMMANDS: string[];
export declare class CommandPolicy {
    private allowlist;
    private blocklist;
    constructor(config?: {
        allowlist?: string[];
        blocklist?: string[];
    });
    isAllowed(command: string): boolean;
    getReason(command: string): {
        allowed: boolean;
        reason: string;
    };
}
//# sourceMappingURL=command-policy.d.ts.map