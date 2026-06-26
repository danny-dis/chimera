import { TUI } from './tui.js';
import type { TUIProps } from './types.js';
export * from './types.js';
export { TUI };
export type TUIHandle = {
    update: (newProps: Partial<TUIProps>) => void;
    waitUntilExit: () => Promise<void>;
    cleanup: () => void;
};
export declare function runTUI(props: TUIProps): TUIHandle;
//# sourceMappingURL=index.d.ts.map