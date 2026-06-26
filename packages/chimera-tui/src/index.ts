import React from 'react';
import { render } from 'ink';
import { TUI } from './tui.js';
import type { TUIProps } from './types.js';

export * from './types.js';
export { TUI };
export type TUIHandle = {
  update: (newProps: Partial<TUIProps>) => void;
  waitUntilExit: () => Promise<void>;
  cleanup: () => void;
};

export function runTUI(props: TUIProps): TUIHandle {
  const { rerender, waitUntilExit, cleanup } = render(React.createElement(TUI, props), {
    exitOnCtrlC: false,
  });

  return {
    update: (newProps: Partial<TUIProps>) => {
      rerender(React.createElement(TUI, { ...props, ...newProps }));
    },
    waitUntilExit,
    cleanup,
  };
}
