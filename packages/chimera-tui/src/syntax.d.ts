type Color = string;
export interface SyntaxToken {
    value: string;
    color: Color;
}
export declare function tokenizeCode(code: string, lang: string): SyntaxToken[];
export {};
//# sourceMappingURL=syntax.d.ts.map