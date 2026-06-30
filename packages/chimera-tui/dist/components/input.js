import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
const BACKSPACE_CHARS = new Set(['\x7f', '\x08', '\b']);
export const Input = ({ onSubmit, autocomplete, placeholder = 'Type a message or /help for commands...', disabled = false, }) => {
    const [value, setValue] = useState('');
    const [history, setHistory] = useState([]);
    const valueRef = useRef(value);
    valueRef.current = value;
    const historyRef = useRef(history);
    historyRef.current = history;
    const historyIndexRef = useRef(-1);
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const autocompleteRef = useRef(autocomplete);
    autocompleteRef.current = autocomplete;
    useEffect(() => {
        if (disabled)
            return;
        const wasRaw = process.stdin.isRaw;
        if (typeof process.stdin.setRawMode === 'function') {
            process.stdin.setRawMode(true);
        }
        const onData = (data) => {
            const str = data.toString('utf-8');
            if (BACKSPACE_CHARS.has(str)) {
                setValue((prev) => prev.slice(0, -1));
                return;
            }
            if (str === '\r' || str === '\n') {
                const trimmed = valueRef.current.trim();
                if (!trimmed)
                    return;
                onSubmitRef.current(trimmed);
                setHistory((prev) => [...prev, trimmed]);
                historyIndexRef.current = -1;
                setValue('');
                return;
            }
            if (str === '\t') {
                if (!autocompleteRef.current || !valueRef.current.startsWith('/'))
                    return;
                const matches = autocompleteRef.current(valueRef.current);
                if (matches.length === 1) {
                    setValue(matches[0] + ' ');
                }
                return;
            }
            if (str === '\x1b[A') {
                const next = historyIndexRef.current + 1;
                if (next < historyRef.current.length) {
                    historyIndexRef.current = next;
                    setValue(historyRef.current[historyRef.current.length - 1 - next]);
                }
                return;
            }
            if (str === '\x1b[B') {
                const next = historyIndexRef.current - 1;
                if (next >= 0) {
                    historyIndexRef.current = next;
                    setValue(historyRef.current[historyRef.current.length - 1 - next]);
                }
                else {
                    historyIndexRef.current = -1;
                    setValue('');
                }
                return;
            }
            if (str.length === 1 && str >= ' ') {
                setValue((prev) => prev + str);
            }
        };
        process.stdin.on('data', onData);
        return () => {
            process.stdin.removeListener('data', onData);
            if (typeof process.stdin.setRawMode === 'function') {
                process.stdin.setRawMode(wasRaw ?? false);
            }
        };
    }, [disabled]);
    const isCommand = value.startsWith('/');
    return (React.createElement(Box, { borderStyle: "round", borderColor: isCommand ? 'yellow' : 'blue', paddingLeft: 1, paddingRight: 1 },
        React.createElement(Text, null, '> '),
        isCommand ? (React.createElement(Box, null,
            React.createElement(Text, { color: "yellow" }, value.split(/\s/)[0]),
            React.createElement(Text, { color: "white" }, value.slice(value.split(/\s/)[0].length)))) : (React.createElement(Text, null, value || React.createElement(Text, { dimColor: true }, placeholder))),
        !disabled && React.createElement(Text, { color: "blue" }, "\u258A"),
        disabled && React.createElement(Text, { dimColor: true }, " (disabled)")));
};
//# sourceMappingURL=input.js.map