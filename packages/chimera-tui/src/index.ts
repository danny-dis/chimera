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
  latestRef: React.MutableRefObject<TUIProps>;
  onReady: (set: React.Dispatch<React.SetStateAction<TUIProps>>) => void;
}> = ({ initial, latestRef, onReady }) => {
  const [props, setProps] = useState<TUIProps>(initial);

  latestRef.current = props;

  React.useEffect(() => {
    onReady(setProps);
  }, []);

  return React.createElement(TUI, props);
};

export function runTUI(props: TUIProps): TUIHandle {
  const setterRef = { current: null as React.Dispatch<React.SetStateAction<TUIProps>> | null };
  const latestRef = { current: props };

  const { waitUntilExit, cleanup } = render(
    React.createElement(TUIBridge, {
      initial: props,
      latestRef,
      onReady: (set) => { setterRef.current = set; },
    }),
    { exitOnCtrlC: false },
  );

  return {
    update: (newProps: Partial<TUIProps>) => {
      const merged = { ...latestRef.current, ...newProps };
      if (setterRef.current) {
        setterRef.current(merged);
      }
    },
    waitUntilExit,
    cleanup,
  };
}
