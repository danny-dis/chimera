import { useState, useCallback } from 'react';
import { useInput } from 'ink';
/**
 * Binary focus manager for chat-primary layout.
 * 0 = input (default), 1 = chat viewport.
 */
export function useFocus() {
    const [focusIndex, setFocusIndex] = useState(0);
    const focusInput = useCallback(() => setFocusIndex(0), []);
    const focusChat = useCallback(() => setFocusIndex(1), []);
    useInput((_input, key) => {
        if (key.tab && !key.shift) {
            setFocusIndex((prev) => (prev + 1) % 2);
        }
        if (key.tab && key.shift) {
            setFocusIndex((prev) => (prev - 1 + 2) % 2);
        }
    });
    return {
        focusIndex,
        isFocused: (index) => focusIndex === index,
        focusInput,
        focusChat,
    };
}
//# sourceMappingURL=use-focus.js.map