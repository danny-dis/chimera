import type { CommandResult } from '../commands/commands.js';
import type { Mode, DeliberationMode } from '@chimera/core';
import type { CostData } from '../types.js';
export interface UseCommandsOptions {
    mode: Mode;
    preset: DeliberationMode;
    costData: CostData;
    sessionId: string;
    onModeChange: (mode: Mode) => void;
    onPresetChange: (preset: DeliberationMode) => void;
}
export interface UseCommandsResult {
    execute: (input: string) => CommandResult;
    autocomplete: (partial: string) => string[];
}
export declare function useCommands(options: UseCommandsOptions): UseCommandsResult;
//# sourceMappingURL=use-commands.d.ts.map