import { useState, useCallback, useEffect } from 'react';

export interface FocusManager {
  /** Currently focused index. 0 = input, 1 = chat/viewport. */
  focusIndex: number;
  isFocused: (index: number) => boolean;
  /** Focus the input line. */
  focusInput: () => void;
  /** Focus the chat viewport. */
  focusChat: () => void;
  moveFocus: (direction?: number) => void;
}

/**
 * Binary focus manager for chat-primary layout.
 * 0 = input (default), 1 = chat viewport.
 */
export function useFocus(count = 4): FocusManager {
  const [focusIndex, setFocusIndex] = useState(0);

  const focusInput = useCallback(() => setFocusIndex(0), []);
  const focusChat = useCallback(() => setFocusIndex(1), []);

  useEffect(() => setFocusIndex(previous => Math.min(previous, count - 1)), [count]);
  const moveFocus = useCallback((direction = 1) => {
    setFocusIndex(previous => (previous + direction + count) % count);
  }, [count]);

  return {
    focusIndex,
    isFocused: (index: number) => focusIndex === index,
    focusInput,
    focusChat,
    moveFocus,
  };
}
