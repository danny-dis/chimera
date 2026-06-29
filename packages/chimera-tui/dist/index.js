import React from 'react';
import { render } from 'ink';
import { TUI } from './tui.js';
export * from './types.js';
export { TUI };
export { runCommand, autocompleteCommand, HELP_TEXT } from './commands/commands.js';
export function runTUI(props) {
    const { rerender, waitUntilExit, cleanup } = render(React.createElement(TUI, props), {
        exitOnCtrlC: false,
    });
    return {
        update: (newProps) => {
            rerender(React.createElement(TUI, { ...props, ...newProps }));
        },
        waitUntilExit,
        cleanup,
    };
}
//# sourceMappingURL=index.js.map