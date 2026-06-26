export interface DiscoveredInstruction {
    file: string;
    content: string;
    priority: number;
}
export declare function discoverInstructions(workspaceRoot: string): DiscoveredInstruction[];
export declare function buildInstructionContext(instructions: DiscoveredInstruction[]): string;
//# sourceMappingURL=instruction-discovery.d.ts.map