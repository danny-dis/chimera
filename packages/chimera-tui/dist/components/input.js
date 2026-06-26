import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
export const Input = ({ onSubmit, autocomplete, placeholder = 'Type a message or /help for commands...', disabled = false, }) => {
    const [value, setValue] = useState('');
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    void historyIndex;
    const handleSubmit = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed || disabled)
            return;
        onSubmit(trimmed);
        setHistory((prev) => [...prev, trimmed]);
        setHistoryIndex(-1);
        setValue('');
    }, [value, disabled, onSubmit]);
    const handleAutocomplete = useCallback(() => {
        if (!autocomplete || !value.startsWith('/'))
            return;
        const matches = autocomplete(value);
        if (matches.length === 1) {
            setValue(matches[0] + ' ');
        }
    }, [value, autocomplete]);
    useInput((input, key) => {
        if (disabled)
            return;
        if (key.return) {
            handleSubmit();
            return;
        }
        if (key.tab) {
            handleAutocomplete();
            return;
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
    return (React.createElement(Box, { borderStyle: "round", borderColor: isCommand ? 'yellow' : 'blue', paddingLeft: 1, paddingRight: 1 },
        React.createElement(Text, null, '> '),
        React.createElement(Text, { color: isCommand ? 'yellow' : undefined }, value || React.createElement(Text, { dimColor: true }, placeholder)),
        !disabled && React.createElement(Text, { color: "blue" }, "\u258A"),
        disabled && React.createElement(Text, { dimColor: true }, " (disabled)")));
};
//# sourceMappingURL=input.js.map