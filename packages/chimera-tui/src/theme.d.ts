import type { Mode, DeliberationMode, AgentRole } from '@chimera/core';
/**
 * Zen theme — the single design system for the Chimera TUI.
 * Every component reads colors from here; no raw color strings allowed.
 */
export declare const zen: {
    readonly bg: "black";
    readonly fg: "white";
    readonly muted: "gray";
    readonly accent: "cyan";
    readonly accentDim: "gray";
    readonly success: "green";
    readonly warning: "yellow";
    readonly error: "red";
    readonly info: "blue";
    readonly agent: "magenta";
    readonly panel: "gray";
    readonly border: "gray";
    readonly borderActive: "cyan";
    readonly highlight: "cyan";
    readonly role: Record<AgentRole, string>;
    readonly syntax: {
        readonly keyword: "magenta";
        readonly string: "green";
        readonly comment: "gray";
        readonly number: "yellow";
        readonly function: "cyan";
        readonly type: "blue";
        readonly plain: "white";
    };
};
export declare const MIN_COLUMNS = 80;
export declare const MIN_ROWS = 24;
export declare const SIDEBAR_MIN_WIDTH = 28;
export declare const SIDEBAR_MAX_WIDTH = 45;
export declare const SIDEBAR_CONTENT_OVERHEAD = 9;
export interface ModeMeta {
    icon: string;
    label: string;
    description: string;
}
export declare const MODES: Mode[];
export declare const MODE_META: Record<Mode, ModeMeta>;
export interface PresetMeta {
    icon: string;
    label: string;
    description: string;
}
export declare const PRESETS: DeliberationMode[];
export declare const PRESET_META: Record<DeliberationMode, PresetMeta>;
/** Safe role color lookup (never throws, always returns a valid ink color). */
export declare function roleColors(role: AgentRole): string;
/** Identity passthrough — documents that a string is a theme color. */
export declare function c(color: string): string;
//# sourceMappingURL=theme.d.ts.map