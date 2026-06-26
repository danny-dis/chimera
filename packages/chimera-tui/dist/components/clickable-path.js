import React from 'react';
import { Text } from 'ink';
import fs from 'node:fs';
import path from 'node:path';
// Regex matches Windows or POSIX paths with optional :line:col suffix.
// Examples: src/foo.ts, ./src/foo.ts, C:\Users\foo\bar.ts, /usr/local/bin, file.ts:12:5
const PATH_REGEX = /^(?:[A-Za-z]:)?(?:[\\/][^\\/\s`]+)+(?::\d+)?(?::\d+)?$/;
const stripQuotes = (token) => {
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'")) ||
        (token.startsWith('`') && token.endsWith('`'))) {
        return token.slice(1, -1);
    }
    return token;
};
const isPathLike = (token) => PATH_REGEX.test(token);
const resolveIfRealFile = (token, workspaceRoot) => {
    const cleaned = stripQuotes(token);
    // Strip trailing :line:col or :line so fs lookup targets the file
    const fileOnly = cleaned.replace(/:\d+(?::\d+)?$/, '');
    let abs = null;
    if (path.isAbsolute(fileOnly)) {
        abs = fileOnly;
    }
    else {
        // Reject obvious non-paths (e.g. just "/" or "C:\") before joining
        if (!fileOnly || fileOnly === '/' || fileOnly === '\\')
            return null;
        abs = path.resolve(workspaceRoot, fileOnly);
    }
    try {
        const stat = fs.statSync(abs);
        if (stat.isFile()) {
            return { abs, display: cleaned };
        }
        return null;
    }
    catch {
        return null;
    }
};
const wrapOsc8 = (absPath, display) => {
    // OSC 8 hyperlink: ESC ]8;;URL ESC \ TEXT ESC ]8;; ESC \
    const esc = '';
    return `${esc}]8;;file://${absPath}${esc}\\${display}${esc}]8;;${esc}\\`;
};
export function renderClickablePaths(text, workspaceRoot) {
    // Tokenize on whitespace, keeping the order for reassembly.
    const tokens = text.split(/(\s+)/);
    return tokens.map((token, i) => {
        if (/^\s+$/.test(token) || token.length === 0) {
            return React.createElement(Text, { key: i }, token);
        }
        if (!isPathLike(token)) {
            return React.createElement(Text, { key: i }, token);
        }
        const resolved = resolveIfRealFile(token, workspaceRoot);
        if (!resolved) {
            return React.createElement(Text, { key: i }, token);
        }
        // Ink passes children through, so the OSC 8 bytes render verbatim in
        // supporting terminals (iTerm2, WezTerm, recent Windows Terminal).
        return (React.createElement(Text, { key: i, color: "cyan", underline: true }, wrapOsc8(resolved.abs, resolved.display)));
    });
}
//# sourceMappingURL=clickable-path.js.map