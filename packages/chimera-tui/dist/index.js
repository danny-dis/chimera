import React, { useState } from 'react';
import { render } from 'ink';
import { TUI } from './tui.js';
export * from './types.js';
export { TUI };
export { runCommand, autocompleteCommand, HELP_TEXT } from './commands/commands.js';
const TUIBridge = ({ initial, latestRef, onReady }) => {
    const [props, setProps] = useState(initial);
    latestRef.current = props;
    React.useEffect(() => {
        onReady(setProps);
    }, []);
    return React.createElement(TUI, props);
};
export function runTUI(props) {
    const setterRef = { current: null };
    const latestRef = { current: props };
    const { waitUntilExit, cleanup } = render(React.createElement(TUIBridge, {
        initial: props,
        latestRef,
        onReady: (set) => { setterRef.current = set; },
    }), { exitOnCtrlC: false });
    return {
        update: (newProps) => {
            const merged = { ...latestRef.current, ...newProps };
            if (setterRef.current) {
                setterRef.current(merged);
            }
        },
        waitUntilExit,
        cleanup,
    };
}
//# sourceMappingURL=index.js.map