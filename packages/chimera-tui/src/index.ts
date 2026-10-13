import React, { useState } from 'react';
import { render } from 'ink';
import { TUI } from './tui.js';
import type { TUIProps } from './types.js';

export * from './types.js';
export { TUI };
export { runCommand, autocompleteCommand, HELP_TEXT } from './commands/commands.js';
export type { CommandContext, CommandResult, SessionSummary } from './commands/commands.js';
export type TUIHandle = {
  update: (newProps: Partial<TUIProps>) => void;
  waitUntilExit: () => Promise<void>;
  cleanup: () => void;
};

const TUIBridge: React.FC<{
  initial: TUIProps;
  onReady: (set: React.Dispatch<React.SetStateAction<TUIProps>>) => void;
}> = ({ initial, onReady }) => {
  const [props, setProps] = useState<TUIProps>(initial);


  React.useEffect(() => {
    onReady(setProps);
  }, []);

  return React.createElement(TUI, props);
};

export function runTUI(props: TUIProps): TUIHandle {
  const setterRef = { current: null as React.Dispatch<React.SetStateAction<TUIProps>> | null };
  const latestRef = { current: props };

  const app = render(
    React.createElement(TUIBridge, {
      initial: props,
      onReady: (set) => { setterRef.current = set; set(latestRef.current); },
    }),
    { exitOnCtrlC: false },
  );

  return {
    update: (newProps: Partial<TUIProps>) => {
      latestRef.current = { ...latestRef.current, ...newProps };
      if (setterRef.current) {
        setterRef.current(previous => ({ ...previous, ...newProps }));
      }
    },
    waitUntilExit: app.waitUntilExit,
    cleanup: () => { app.unmount(); app.cleanup(); setterRef.current = null; },
  };
}
