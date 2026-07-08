import { useCallback, useRef } from 'react';
import { runCommand, autocompleteCommand } from '../commands/commands.js';
export function useCommands(options) {
    const historyRef = useRef([]);
    const execute = useCallback((input) => {
        const ctx = {
            getMode: () => options.mode,
            setMode: (m) => options.onModeChange(m),
            getPreset: () => options.preset,
            setPreset: (p) => options.onPresetChange(p),
            getCostData: () => options.costData,
            getHistory: () => historyRef.current,
            sessionId: options.sessionId,
        };
        const result = runCommand(input, ctx);
        historyRef.current.push(input);
        return result;
    }, [options]);
    const autocomplete = useCallback((partial) => {
        return autocompleteCommand(partial);
    }, []);
    return { execute, autocomplete };
}
//# sourceMappingURL=use-commands.js.map