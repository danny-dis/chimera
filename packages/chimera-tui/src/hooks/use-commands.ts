import { useCallback, useRef } from 'react';
import { runCommand, autocompleteCommand } from '../commands/commands.js';
import type { CommandContext, CommandResult } from '../commands/commands.js';
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
  execute: (input: string) => Promise<CommandResult>;
  autocomplete: (partial: string) => string[];
}

export function useCommands(options: UseCommandsOptions): UseCommandsResult {
  const historyRef = useRef<string[]>([]);

  const execute = useCallback(async (input: string): Promise<CommandResult> => {
    const ctx: CommandContext = {
      getMode: () => options.mode,
      setMode: (m) => options.onModeChange(m),
      getPreset: () => options.preset,
      setPreset: (p) => options.onPresetChange(p),
      getCostData: () => options.costData,
      getHistory: () => historyRef.current,
      sessionId: options.sessionId,
    };

    const result = await runCommand(input, ctx);
    historyRef.current.push(input);
    return result;
  }, [options]);

  const autocomplete = useCallback((partial: string): string[] => {
    return autocompleteCommand(partial);
  }, []);

  return { execute, autocomplete };
}
