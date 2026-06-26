import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
const DiffLineComponent = ({ lineNum, type, content }) => {
    const prefix = type === 'addition' ? '+' : type === 'deletion' ? '-' : ' ';
    const color = type === 'addition' ? 'green' : type === 'deletion' ? 'red' : undefined;
    return (React.createElement(Box, null,
        React.createElement(Text, { dimColor: true },
            lineNum !== undefined ? String(lineNum).padStart(4) : '    ',
            " "),
        React.createElement(Text, { color: color, inverse: type !== 'context' }, prefix),
        React.createElement(Text, { color: color }, content)));
};
const FileHeader = ({ file, isExpanded, isSelected }) => {
    return (React.createElement(Box, null,
        React.createElement(Text, { inverse: isSelected }, isSelected ? '▸ ' : '  '),
        React.createElement(Text, { bold: true, color: isExpanded ? 'cyan' : undefined }, file.path),
        React.createElement(Text, null, " "),
        React.createElement(Text, { color: "green" },
            "+",
            file.additions),
        React.createElement(Text, null, " "),
        React.createElement(Text, { color: "red" },
            "-",
            file.deletions)));
};
export const DiffViewer = ({ files }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [expandedFiles, setExpandedFiles] = useState(new Set([0]));
    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(files.length - 1, prev + 1));
            return;
        }
        if (key.return || input === ' ') {
            setExpandedFiles((prev) => {
                const next = new Set(prev);
                if (next.has(selectedIndex)) {
                    next.delete(selectedIndex);
                }
                else {
                    next.add(selectedIndex);
                }
                return next;
            });
            return;
        }
    });
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: "red", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "red" }, "Diff Viewer"),
            React.createElement(Text, { dimColor: true },
                " (",
                files.length,
                " files)")),
        files.length === 0 && React.createElement(Text, { dimColor: true }, "No changes to display"),
        files.map((file, i) => (React.createElement(Box, { key: file.path, flexDirection: "column" },
            React.createElement(FileHeader, { file: file, isExpanded: expandedFiles.has(i), isSelected: i === selectedIndex }),
            expandedFiles.has(i) &&
                file.hunks.map((hunk, j) => (React.createElement(Box, { key: j, flexDirection: "column", marginLeft: 2 },
                    React.createElement(Text, { dimColor: true },
                        "@@ -",
                        hunk.oldStart,
                        ",",
                        hunk.oldLines,
                        " +",
                        hunk.newStart,
                        ",",
                        hunk.newLines,
                        " @@"),
                    hunk.lines.map((line, k) => (React.createElement(DiffLineComponent, { key: k, lineNum: line.newLineNum, type: line.type, content: line.content }))))))))),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, "\u2191\u2193: navigate  Enter/Space: toggle file"))));
};
//# sourceMappingURL=diff-viewer.js.map