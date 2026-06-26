import type { Mode, DeliberationMode } from '@chimera/core';
import type { CostData } from '../types.js';
export interface CommandResult {
    /** Lines of output rendered as system messages in the chat. */
    output: string[];
    /** Signal the TUI to switch to a specific overlay or view. */
    viewHint?: 'sessions' | 'diff' | 'agents' | 'events' | null;
    /** Signal the TUI to clear the message list. */
    clearMessages?: boolean;
    /** Signal the TUI to exit. */
    exit?: boolean;
}
export interface CommandContext {
    getMode(): Mode;
    setMode(m: Mode): void;
    getPreset(): DeliberationMode;
    setPreset(p: DeliberationMode): void;
    getCostData(): CostData;
    getHistory(): string[];
    sessionId: string;
}
export declare function runCommand(input: string, ctx: CommandContext): CommandResult;
/**
 * Given a partial input like "/co" return matching command names.
 */
export declare function autocompleteCommand(partial: string): string[];
//# sourceMappingURL=commands.d.ts.map