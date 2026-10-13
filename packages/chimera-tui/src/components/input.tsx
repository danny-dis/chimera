import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdin } from 'ink';
import { stripVTControlCharacters } from 'node:util';
import { zen, hierarchy, tiered, panelBorderColor, PANEL_BORDER } from '../theme.js';
import type { SkillModelView } from '../types.js';

interface InputProps {
  onSubmit: (text: string) => void;
  autocomplete?: (partial: string) => string[];
  placeholder?: string;
  disabled?: boolean;
  /** Whether this component holds logical focus (drives border color and,
   * critically, whether it captures stdin at all — see the effect below). */
  focused?: boolean;
  onTab?: (reverse: boolean) => void;
  skillModel?: SkillModelView;
}

const BACKSPACE_CHARS = new Set(['\x7f', '\x08', '\b']);
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** C0/C1 control and escape bytes to strip from a pasted chunk. Embedded
 * line breaks are collapsed to a space since this is a single-line composer. */
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/g;
const LINE_BREAK_RE = /\x0d\x0a|[\x0d\x0a\x09]/g;

/** Sanitize a multi-character stdin chunk (typically a paste) for insertion. */
function sanitizePastedText(raw: string): string {
  return stripVTControlCharacters(raw).replace(LINE_BREAK_RE, ' ').replace(CONTROL_CHAR_RE, '');
}

const DEFAULT_PLACEHOLDERS: { beginner: string; intermediate: string; advanced: string } = {
  beginner: 'Type a task in plain language, or /help to see what Chimera can do...',
  intermediate: 'Type a message or /help for commands...',
  advanced: '/help for commands — or type a task.',
};

export const Input: React.FC<InputProps> = ({
  onSubmit,
  autocomplete,
  placeholder,
  disabled = false,
  focused = true,
  onTab,
  skillModel,
}) => {
  const effectivePlaceholder = placeholder ?? tiered(DEFAULT_PLACEHOLDERS, skillModel);
  const { stdin, setRawMode } = useStdin();
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(-1);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const autocompleteRef = useRef(autocomplete);
  autocompleteRef.current = autocomplete;
  const onTabRef = useRef(onTab);
  onTabRef.current = onTab;

  useEffect(() => {
    // Only capture stdin while this component holds logical focus. This is
    // what makes the m/l explain-depth toggle in tui.tsx safe: while the
    // input is unfocused it stops consuming keystrokes entirely, so there's
    // never a keypress both handlers react to.
    if (disabled || !focused) return;

    setRawMode(true);

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');

      if (BACKSPACE_CHARS.has(str)) {
        setValue((prev) => [...GRAPHEMES.segment(prev)].slice(0, -1).map(part => part.segment).join(''));
        return;
      }

      if (str === '\r' || str === '\n') {
        const trimmed = valueRef.current.trim();
        if (!trimmed) return;
        onSubmitRef.current(trimmed);
        setHistory((prev) => [...prev, trimmed]);
        historyIndexRef.current = -1;
        setValue('');
        return;
      }

      if (str === '\t') {
        if (!autocompleteRef.current || !valueRef.current.startsWith('/')) {
          onTabRef.current?.(false);
          return;
        }
        const matches = autocompleteRef.current(valueRef.current);
        if (matches.length === 1) {
          setValue(sanitizePastedText(matches[0]) + ' ');
        }
        return;
      }

      if (str === '\x1b[Z') { onTabRef.current?.(true); return; }

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
        } else {
          historyIndexRef.current = -1;
          setValue('');
        }
        return;
      }


      // Multi-character chunk: terminals typically deliver a paste (e.g. a
      // file path) as one 'data' event rather than one keystroke at a time.
      // Previously anything longer than one character was silently dropped;
      // now we sanitize control/escape bytes and append the rest in one go.
      if (str.length > 0) {
        const cleaned = sanitizePastedText(str);
        if (cleaned) {
          setValue((prev) => prev + cleaned);
        }
      }
    };

    stdin.on('data', onData);

    return () => {
      stdin.removeListener('data', onData);
      setRawMode(false);
    };
  }, [disabled, focused, stdin, setRawMode]);

  const isCommand = value.startsWith('/');
  const active = focused && !disabled;

  return (
    <Box
      borderStyle={PANEL_BORDER}
      borderColor={panelBorderColor(active)}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text bold color={active ? zen.accent : zen.muted}>{'❯ '}</Text>
      {isCommand ? (
        <Box>
          <Text color={zen.warning}>{value.split(/\s/)[0]}</Text>
          <Text color={zen.fg}>{value.slice(value.split(/\s/)[0].length)}</Text>
        </Box>
      ) : (
        <Text>{value || <Text {...hierarchy.tertiary}>{effectivePlaceholder}</Text>}</Text>
      )}
      {active && <Text color={zen.info}>▊</Text>}
      {disabled && <Text {...hierarchy.tertiary}> (disabled)</Text>}
      {!disabled && !focused && <Text {...hierarchy.tertiary}> (Tab to type)</Text>}
    </Box>
  );
};
