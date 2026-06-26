export interface MicroCompactResult {
    messages: Array<{
        role: string;
        content: string;
    }>;
    tokensSaved: number;
}
export declare function microCompact(messages: Array<{
    role: string;
    content: string;
}>): MicroCompactResult;
//# sourceMappingURL=microcompact.d.ts.map