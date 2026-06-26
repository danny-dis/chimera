export interface SnipResult {
    messages: Array<{
        role: string;
        content: string;
    }>;
    tokensSaved: number;
    boundaries: number[];
}
export declare function snipCompact(messages: Array<{
    role: string;
    content: string;
}>): SnipResult;
//# sourceMappingURL=snip.d.ts.map