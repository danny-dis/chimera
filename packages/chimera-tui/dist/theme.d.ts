type Color = string;
export interface Theme {
    bg: Color;
    fg: Color;
    accent: Color;
    muted: Color;
    success: Color;
    warning: Color;
    error: Color;
    info: Color;
    role: Record<string, Color>;
    border: Color;
    borderActive: Color;
    syntax: Record<string, Color>;
}
export declare const zen: Theme;
export declare const MIN_COLUMNS = 80;
export declare const MIN_ROWS = 24;
export {};
//# sourceMappingURL=theme.d.ts.map