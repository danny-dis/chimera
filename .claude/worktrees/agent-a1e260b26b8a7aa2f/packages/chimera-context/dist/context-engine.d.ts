export interface RepoIndex {
    files: Map<string, {
        tokensEstimate: number;
        imports: string[];
    }>;
    symbols: Map<string, Array<{
        file: string;
        line: number;
        kind: string;
    }>>;
}
export declare class ContextEngine {
    private workspaceRoot;
    private instructionsFile?;
    private repoIndex;
    private importGraph;
    constructor(workspaceRoot: string, instructionsFile?: string | undefined);
    indexRepo(): Promise<void>;
    private walk;
    private extractSymbols;
    private extractImports;
    getIndexedFiles(): string[];
    getFileTokens(filePath: string): number | undefined;
    getTotalTokens(): number;
    findRelatedFiles(imports: string[]): string[];
    findRelatedFilesBySymbol(symbolName: string): string[];
    private computeImportCentrality;
    static readonly SYSTEM_POLICY = "# Chimera Core Rules\n- All code must be modular and reusable.\n- Single responsibility: each module does one thing well.\n- Interface-first: define contracts before implementations.\n- Dependency injection: pass dependencies as parameters.\n- Pure functions where possible.\n- Composable over monolithic.\n- No circular dependencies.";
    getInstructionsHierarchy(params?: {
        mode?: string;
        touchedFiles?: string[];
    }): Promise<string>;
    private findNearbyInstructions;
    getAgentInstructions(): Promise<string>;
    setInstructions(content: string): Promise<void>;
    getRepoMap(): string;
    private importanceBar;
    private countFileSymbols;
    buildContextPack(params: {
        task: string;
        maxTokens: number;
        includeFiles?: string[];
        excludePatterns?: string[];
    }): Promise<{
        files: Array<{
            path: string;
            content: string;
            tokens: number;
            reason: string;
        }>;
        totalTokens: number;
        summary: string;
    }>;
}
//# sourceMappingURL=context-engine.d.ts.map