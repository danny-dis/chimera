import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const Input: React.FC<InputProps> = ({
  onSubmit,
  placeholder = 'Type a message or /help for commands...',
  disabled = false,
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  // Touch historyIndex to keep linter happy (it is read inside input handlers via setState callbacks)
  void historyIndex;

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSubmit(trimmed);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setValue('');
  }, [value, disabled, onSubmit]);

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      handleSubmit();
      return;
    }

    if (key.ctrl && input === 'c') {
      process.exit(0);
    }

    if (key.upArrow) {
      setHistoryIndex((prev) => {
        const next = prev + 1;
        if (next < history.length) {
          setValue(history[history.length - 1 - next]);
          return next;
        }
        return prev;
      });
      return;
    }

    if (key.downArrow) {
      setHistoryIndex((prev) => {
        const next = prev - 1;
        if (next >= 0) {
          setValue(history[history.length - 1 - next]);
          return next;
        }
        setValue('');
        return -1;
      });
      return;
    }

    if (key.backspace) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  const isCommand = value.startsWith('/');

  return (
    <Box
      borderStyle="round"
      borderColor={isCommand ? 'yellow' : 'blue'}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text>{'> '}</Text>
      <Text color={isCommand ? 'yellow' : undefined}>
        {value || <Text dimColor>{placeholder}</Text>}
      </Text>
      {!disabled && <Text color="blue">▊</Text>}
      {disabled && <Text dimColor> (disabled)</Text>}
    </Box>
  );
};
