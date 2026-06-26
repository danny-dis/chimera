export interface FocusManager {
    /** Currently focused index. 0 = input, 1 = chat/viewport. */
    focusIndex: number;
    isFocused: (index: number) => boolean;
    /** Focus the input line. */
    focusInput: () => void;
    /** Focus the chat viewport. */
    focusChat: () => void;
}
/**
 * Binary focus manager for chat-primary layout.
 * 0 = input (default), 1 = chat viewport.
 */
export declare function useFocus(): FocusManager;
//# sourceMappingURL=use-focus.d.ts.map