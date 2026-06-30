import React from 'react';
import { Box, Text } from 'ink';
import { tokenizeCode } from '../syntax.js';
import { zen } from '../theme.js';
// ── Tokeniser ───────────────────────────────────────────────────────────
/**
 * Very small markdown tokeniser. Handles the subset of markdown a coding
 * agent actually produces — fenced code blocks, inline code, bold, italic,
 * headings, unordered/ordered lists, and horizontal rules.
 *
 * Intentionally does NOT handle:
 *   - nested lists, blockquotes, tables, images, links with titles
 *   - reference-style links
 * Those can be added later if needed.
 */
function stripThoughtBlocks(src) {
    return src.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<thought>[\s\S]*$/gi, '');
}
function tokenize(src) {
    const tokens = [];
    const lines = stripThoughtBlocks(src).split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        // ── Fenced code blocks ───────────────────────────────────────────
        const fenceMatch = line.match(/^(`{3,})\s*(\w*)\s*$/);
        if (fenceMatch) {
            const openFence = fenceMatch[1];
            const lang = fenceMatch[2] || undefined;
            const blockLines = [];
            i++;
            while (i < lines.length && !lines[i].startsWith(openFence)) {
                blockLines.push(lines[i]);
                i++;
            }
            i++; // skip closing fence
            tokens.push({ type: 'code_block', lang, lines: blockLines });
            continue;
        }
        // ── Horizontal rule ───────────────────────────────────────────────
        if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
            tokens.push({ type: 'hr' });
            i++;
            continue;
        }
        // ── Headings ─────────────────────────────────────────────────────
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const inline = parseInline(headingMatch[2]);
            tokens.push({ type: 'heading', level, children: inline });
            i++;
            continue;
        }
        // ── Unordered list ────────────────────────────────────────────────
        const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)/);
        if (ulMatch) {
            const children = parseInline(ulMatch[3]);
            tokens.push({ type: 'list_item', ordered: false, children });
            i++;
            continue;
        }
        // ── Ordered list ─────────────────────────────────────────────────
        const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
        if (olMatch) {
            const index = parseInt(olMatch[2], 10);
            const children = parseInline(olMatch[3]);
            tokens.push({ type: 'list_item', ordered: true, index, children });
            i++;
            continue;
        }
        // ── Paragraph (may span multiple lines until blank line or block) ──
        if (line.trim() === '') {
            i++;
            continue; // skip blank lines between blocks
        }
        // Collect consecutive non-blank, non-block lines into a paragraph
        const paraLines = [];
        while (i < lines.length &&
            lines[i].trim() !== '' &&
            !lines[i].match(/^(`{3,})/) &&
            !lines[i].match(/^#{1,6}\s/) &&
            !lines[i].match(/^\s*[-*+]\s/) &&
            !lines[i].match(/^\s*\d+\.\s/) &&
            !lines[i].match(/^(\*{3,}|-{3,}|_{3,})\s*$/)) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            const children = parseInline(paraLines.join('\n'));
            tokens.push({ type: 'paragraph', children });
        }
    }
    return tokens;
}
// ── Inline parsing ───────────────────────────────────────────────────────
function parseInline(src) {
    const tokens = [];
    let rest = src;
    let pos = 0;
    while (pos < rest.length) {
        // ── Inline code ──────────────────────────────────────────────────
        if (rest[pos] === '`' && rest[pos + 1] !== '`') {
            const end = rest.indexOf('`', pos + 1);
            if (end !== -1) {
                tokens.push({ type: 'code', value: rest.slice(pos + 1, end) });
                pos = end + 1;
                continue;
            }
        }
        // ── Bold + italic (***text*** or ___text___) ─────────────────────
        if ((rest[pos] === '*' && rest[pos + 1] === '*' && rest[pos + 2] === '*') ||
            (rest[pos] === '_' && rest[pos + 1] === '_' && rest[pos + 2] === '_')) {
            const marker = rest.slice(pos, pos + 3);
            const end = rest.indexOf(marker, pos + 3);
            if (end !== -1) {
                const inner = rest.slice(pos + 3, end);
                tokens.push({
                    type: 'bold',
                    children: [{ type: 'italic', children: parseInline(inner) }],
                });
                pos = end + 3;
                continue;
            }
        }
        // ── Bold (**text** or __text__) ────────────────────────────────────
        if ((rest[pos] === '*' && rest[pos + 1] === '*') ||
            (rest[pos] === '_' && rest[pos + 1] === '_')) {
            const marker = rest.slice(pos, pos + 2);
            const end = rest.indexOf(marker, pos + 2);
            if (end !== -1) {
                const inner = rest.slice(pos + 2, end);
                // Make sure the end marker isn't part of a longer sequence
                const afterEnd = rest[end + 2];
                if (afterEnd !== marker[0]) {
                    tokens.push({ type: 'bold', children: parseInline(inner) });
                    pos = end + 2;
                    continue;
                }
            }
        }
        // ── Italic (*text* or _text_) ─────────────────────────────────────
        if (rest[pos] === '*' || rest[pos] === '_') {
            const marker = rest[pos];
            const end = rest.indexOf(marker, pos + 1);
            if (end !== -1) {
                const inner = rest.slice(pos + 1, end);
                // Ensure not part of ** or __
                const before = pos > 0 ? rest[pos - 1] : ' ';
                const after = rest[end + 1] || ' ';
                if (before !== marker && after !== marker) {
                    tokens.push({ type: 'italic', children: parseInline(inner) });
                    pos = end + 1;
                    continue;
                }
            }
        }
        // ── Plain text (collect until next special char) ──────────────────
        let textEnd = pos + 1;
        while (textEnd < rest.length &&
            rest[textEnd] !== '`' &&
            rest[textEnd] !== '*' &&
            rest[textEnd] !== '_') {
            textEnd++;
        }
        const text = rest.slice(pos, textEnd);
        if (text) {
            tokens.push({ type: 'text', value: text });
        }
        pos = textEnd;
    }
    return tokens;
}
// ── Renderers ─────────────────────────────────────────────────────────────
const renderInlineTokens = (tokens) => tokens.map((token, i) => React.createElement(InlineTokenRenderer, { key: i, token: token }));
const InlineTokenRenderer = ({ token }) => {
    switch (token.type) {
        case 'text':
            return React.createElement(Text, null, token.value);
        case 'bold':
            return React.createElement(Text, { bold: true }, renderInlineTokens(token.children));
        case 'italic':
            return React.createElement(Text, { italic: true }, renderInlineTokens(token.children));
        case 'code':
            return (React.createElement(Text, { backgroundColor: zen.muted, color: zen.fg }, ` ${token.value} `));
        default:
            return null;
    }
};
const BlockTokenRenderer = ({ token }) => {
    switch (token.type) {
        case 'heading': {
            const level = Math.min(token.level, 6);
            return (React.createElement(Box, { marginTop: level <= 2 ? 1 : 0, marginBottom: 0 },
                React.createElement(Text, { bold: true, underline: level <= 2, color: level === 1 ? zen.accent : level === 2 ? zen.info : undefined },
                    '#'.repeat(level),
                    " ",
                    renderInlineTokens(token.children))));
        }
        case 'paragraph':
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 0, width: "100%" }, renderInlineTokens(token.children)));
        case 'code_block': {
            const highlighted = token.lang
                ? token.lines.map((line) => tokenizeCode(line, token.lang))
                : token.lines.map((line) => [{ value: line, color: 'white' }]);
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1, borderStyle: "single", borderColor: zen.muted },
                token.lang && (React.createElement(Box, { paddingLeft: 1 },
                    React.createElement(Text, { dimColor: true }, token.lang))),
                highlighted.map((tokens, j) => (React.createElement(Box, { key: j, paddingLeft: 1 }, tokens.map((t, k) => (React.createElement(Text, { key: k, color: t.color }, t.value))))))));
        }
        case 'list_item': {
            const bullet = token.ordered ? `${token.index ?? 1}.` : '•';
            return (React.createElement(Box, { marginLeft: 2, width: "100%" },
                React.createElement(Text, { bold: true }, bullet),
                React.createElement(Text, null, " "),
                renderInlineTokens(token.children)));
        }
        case 'hr':
            return (React.createElement(Box, { marginTop: 1, marginBottom: 1 },
                React.createElement(Text, { dimColor: true }, '─'.repeat(40))));
        default:
            return null;
    }
};
export const Markdown = ({ content }) => {
    const tokens = tokenize(content);
    return (React.createElement(Box, { flexDirection: "column", width: "100%" }, tokens.map((token, i) => (React.createElement(BlockTokenRenderer, { key: i, token: token })))));
};
//# sourceMappingURL=markdown.js.map