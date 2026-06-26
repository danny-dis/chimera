export interface CollapseResult {
    messages: Array<{
        role: string;
        content: string;
    }>;
    tokensSaved: number;
}
export declare function contextCollapse(messages: Array<{
    role: string;
    content: string;
}>): CollapseResult;
//# sourceMappingURL=context-collapse.d.ts.map